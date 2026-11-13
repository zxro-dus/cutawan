import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SUBSCRIPTION, normalizeSubscription, transcribesLocally } from '../src/shared/subscription'
import { DEFAULT_GEMINI_MODEL, GEMINI_API_BASE } from '../src/shared/gemini'
import { configureSubscription, usesLocalTranscription } from '../src/main/subscription'
import { chatApiBase, chatJSON, configureOpenAiEndpoints, transcribeAudioFile, transcriptionApiBase } from '../src/main/pipeline/openai'

const settings = vi.hoisted(() => ({ key: 'gem-key', model: 'gemini-test-model' }))
vi.mock('../src/main/settings', () => ({
  getGeminiKey: () => settings.key,
  getGeminiModel: () => settings.model
}))
import { checkGeminiConnection } from '../src/main/gemini'

const schema = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } }
const ok = (content = '{"ok":true}'): Response => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })

describe('Gemini provider settings', () => {
  it('is an accepted provider and always transcribes locally, without touching the saved flag', () => {
    const value = normalizeSubscription({ provider: 'gemini' })
    expect(value.provider).toBe('gemini')
    expect(value.localTranscription).toBe(false)
    expect(transcribesLocally(value)).toBe(true)
    expect(transcribesLocally({ provider: 'api', localTranscription: false })).toBe(false)
    expect(transcribesLocally({ provider: 'openrouter', localTranscription: false })).toBe(false)
    expect(normalizeSubscription({ provider: 'nonsense' as never }).provider).toBe('api')
  })

  it('defaults to the verified Gemini compatibility endpoint', () => {
    expect(GEMINI_API_BASE).toBe('https://generativelanguage.googleapis.com/v1beta/openai')
    expect(DEFAULT_GEMINI_MODEL).toMatch(/^gemini-/)
  })
})

describe('Gemini request routing', () => {
  const envBase = process.env.OPENAI_BASE_URL
  beforeEach(() => {
    configureSubscription({ ...DEFAULT_SUBSCRIPTION, provider: 'gemini' })
    configureOpenAiEndpoints({ gemini: true, chatBase: 'https://example.invalid/v1', credential: () => 'gem-key' })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    configureOpenAiEndpoints({})
    configureSubscription(DEFAULT_SUBSCRIPTION)
    if (envBase === undefined) delete process.env.OPENAI_BASE_URL
    else process.env.OPENAI_BASE_URL = envBase
  })

  it('sends analysis only to Google, ignoring OpenAI base URL settings and env', async () => {
    process.env.OPENAI_BASE_URL = 'https://proxy.example.com/v1'
    expect(chatApiBase()).toBe(GEMINI_API_BASE)
    const fetchMock = vi.fn(async () => ok())
    vi.stubGlobal('fetch', fetchMock)
    const result = await chatJSON<{ ok: boolean }>('gem-key', 'gemini-test-model', [{ role: 'user', content: 'hi' }], 'test', schema)
    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${GEMINI_API_BASE}/chat/completions`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gem-key')
    expect(JSON.parse(String(init.body)).model).toBe('gemini-test-model')
    expect(Object.keys(init.headers as object)).not.toContain('HTTP-Referer')
  })

  it('refuses to send any other credential to Google', async () => {
    const fetchMock = vi.fn(async () => ok())
    vi.stubGlobal('fetch', fetchMock)
    await expect(chatJSON('sk-openai-key', 'm', [], 'test', schema)).rejects.toThrow(/changed in Settings/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never routes transcription to Gemini or to an OpenAI URL', async () => {
    expect(usesLocalTranscription()).toBe(true)
    expect(() => transcriptionApiBase()).toThrow(/local Whisper/)
    const fetchMock = vi.fn(async () => ok())
    vi.stubGlobal('fetch', fetchMock)
    // No Whisper model folder is configured, so it fails locally — and sends nothing.
    await expect(transcribeAudioFile('gem-key', '/nonexistent.mp3', 'whisper-1')).rejects.toThrow(/local Whisper/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a bad key clearly, including Gemini array-wrapped errors, without retrying', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify([{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }]), { status: 400 }
    ))
    vi.stubGlobal('fetch', fetchMock)
    await expect(chatJSON('gem-key', 'm', [], 'test', schema)).rejects.toThrow(/Gemini API key/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to json_object when Gemini rejects the strict schema', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { response_format?: { type?: string } }
      return body.response_format?.type === 'json_schema'
        ? new Response(JSON.stringify({ error: { message: 'Invalid JSON payload received. Unknown name "additionalProperties"' } }), { status: 400 })
        : ok()
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(chatJSON('gem-key', 'm', [], 'test', schema)).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('checkGeminiConnection', () => {
  const models = (...ids: string[]): Response => new Response(JSON.stringify({ data: ids.map(id => ({ id })) }), { status: 200 })

  it('confirms the key and model with a free model-list request', async () => {
    const fetchMock = vi.fn(async () => models('models/gemini-test-model', 'models/other'))
    const result = await checkGeminiConnection(fetchMock as unknown as typeof fetch)
    expect(result.message).toContain('gemini-test-model')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${GEMINI_API_BASE}/models`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gem-key')
  })

  it('explains a rejected key, an unknown model, a missing key and no connection', async () => {
    await expect(checkGeminiConnection((async () => new Response('{}', { status: 403 })) as typeof fetch)).rejects.toThrow(/rejected the Gemini API key/)
    await expect(checkGeminiConnection((async () => models('models/other')) as typeof fetch)).rejects.toThrow(/gemini-test-model/)
    await expect(checkGeminiConnection((async () => { throw new TypeError('fetch failed') }) as typeof fetch)).rejects.toThrow(/Could not reach Google/)
    settings.key = ''
    await expect(checkGeminiConnection((async () => models()) as typeof fetch)).rejects.toThrow(/Add your Gemini API key/)
    settings.key = 'gem-key'
  })
})

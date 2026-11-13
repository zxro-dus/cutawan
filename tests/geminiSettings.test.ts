import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mock = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => mock.root, getVersion: () => '0.0.0' },
  // Reversible fake "encryption" so the test can prove the key is not stored as typed.
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${[...s].reverse().join('')}`),
    decryptString: (b: Buffer) => [...b.toString().slice(4)].reverse().join('')
  }
}))
vi.mock('../src/main/pipeline/encoders', () => ({ getGpuStatus: async () => ({ available: false, detail: '', canDownloadFfmpeg: false }) }))
vi.mock('../src/main/cookies', () => ({ clearImportCookiesFile: async () => undefined, getImportCookiesPath: () => null }))

beforeEach(async () => {
  mock.root = await mkdtemp(join(tmpdir(), 'cutawan-gemini-settings-'))
  vi.resetModules()
  delete process.env.GEMINI_API_KEY
})
afterEach(async () => { await rm(mock.root, { recursive: true, force: true }) })

it('stores the Gemini key encrypted, masks it for the UI, and routes analysis to Gemini', async () => {
  const settings = await import('../src/main/settings')
  const { chatApiBase } = await import('../src/main/pipeline/openai')
  const before = await settings.getSettings()
  expect(before.hasGeminiKey).toBe(false)
  expect(before.geminiModel).toBe('gemini-3.8-flash')

  const after = await settings.updateSettings({
    subscription: { provider: 'gemini' },
    geminiKey: '  AIzaSyExampleKey1234567890  ',
    geminiModel: 'gemini-custom'
  })
  expect(after.hasGeminiKey).toBe(true)
  expect(after.geminiKeyMasked).not.toContain('ExampleKey')
  expect(after.geminiKeyMasked.length).toBeLessThan(15)
  expect(JSON.stringify(after)).not.toContain('AIzaSyExampleKey1234567890')

  const onDisk = await readFile(join(mock.root, 'settings.json'), 'utf8')
  expect(onDisk).not.toContain('AIzaSyExampleKey1234567890')
  expect(settings.getGeminiKey()).toBe('AIzaSyExampleKey1234567890')
  expect(settings.getAnalysisCredential()).toBe('AIzaSyExampleKey1234567890')
  expect(settings.missingCredentialName()).toBe('Gemini API key')
  expect(settings.getModelPreferences().analysisModel).toBe('gemini-custom')
  expect(chatApiBase()).toBe('https://generativelanguage.googleapis.com/v1beta/openai')
})

it('keeps OpenAI and OpenRouter credentials and models independent of Gemini', async () => {
  const settings = await import('../src/main/settings')
  await settings.updateSettings({ apiKey: 'sk-openai', openRouterKey: 'sk-or-v1-abc', geminiKey: 'AIza-gem', analysisModel: 'gpt-x', subscription: { provider: 'api' } })
  expect(settings.getAnalysisCredential()).toBe('sk-openai')
  expect(settings.getModelPreferences().analysisModel).toBe('gpt-x')
  await settings.updateSettings({ subscription: { provider: 'openrouter' } })
  expect(settings.getAnalysisCredential()).toBe('sk-or-v1-abc')
  await settings.updateSettings({ subscription: { provider: 'gemini' } })
  expect(settings.getAnalysisCredential()).toBe('AIza-gem')
  await settings.updateSettings({ subscription: { provider: 'api' }, geminiKey: '' })
  expect(settings.getAnalysisCredential()).toBe('sk-openai')
  expect(settings.getGeminiKey()).toBe('')
})

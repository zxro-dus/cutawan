import { GEMINI_API_BASE } from '@shared/gemini'
import { getGeminiKey, getGeminiModel } from './settings'

const CHECK_TIMEOUT_MS = 12_000

/**
 * Settings "Test connection": lists models with the stored key. It sends no
 * prompt, so it costs nothing and cannot touch the video pipeline.
 */
export async function checkGeminiConnection(fetchImpl: typeof fetch = fetch): Promise<{ message: string }> {
  const key = getGeminiKey()
  if (!key) throw new Error('Add your Gemini API key first.')
  const model = getGeminiModel()
  let res: Response
  try {
    res = await fetchImpl(`${GEMINI_API_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    })
  } catch {
    throw new Error('Could not reach Google. Check your internet connection and try again.')
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error('Google rejected the Gemini API key. Check it in Settings.')
  }
  if (res.status === 429) throw new Error('Gemini is rate limiting this key right now. Try again in a minute.')
  if (!res.ok) throw new Error(`Gemini connection check failed (HTTP ${res.status}).`)
  let ids: string[] = []
  try {
    const body = (await res.json()) as { data?: Array<{ id?: string }> }
    ids = (body.data ?? []).flatMap(m => (typeof m.id === 'string' ? [m.id.replace(/^models\//, '')] : []))
  } catch {
    /* the key worked; the model list was unreadable */
  }
  if (ids.length > 0 && !ids.includes(model)) {
    throw new Error(`The key works, but Google does not list a model called "${model}". Check the model name in Settings.`)
  }
  return { message: `Connected to Gemini. Model "${model}" is available. No analysis request was made.` }
}

export interface SubscriptionSettings {
  provider: 'api' | 'chatgpt' | 'openrouter' | 'gemini'
  codexPath: string
  codexModel: string
  dailyRequestLimit: number
  pythonPath: string
  whisperModelPath: string
  /** Use local faster-whisper even when analysis uses an API (OpenAI-compatible or OpenRouter). */
  localTranscription: boolean
}

/** Hard adapter limit; callers must split visual requests before serialization. */
export const MAX_SUBSCRIPTION_IMAGES = 10

export const DEFAULT_SUBSCRIPTION: SubscriptionSettings = {
  provider: 'api',
  codexPath: 'codex',
  codexModel: 'gpt-5.6-luna',
  dailyRequestLimit: 10,
  pythonPath: 'python',
  whisperModelPath: '',
  localTranscription: false
}

/**
 * True when speech is transcribed on this computer. ChatGPT and Gemini have no
 * hosted Whisper route here, so they always use local Whisper; the stored
 * `localTranscription` flag is left alone so switching back keeps the user's choice.
 */
export function transcribesLocally(value: Pick<SubscriptionSettings, 'provider' | 'localTranscription'>): boolean {
  return value.provider === 'chatgpt' || value.provider === 'gemini' || value.localTranscription
}

export function normalizeSubscription(value?: Partial<SubscriptionSettings>): SubscriptionSettings {
  const limit = value?.dailyRequestLimit
  return {
    provider: value?.provider === 'chatgpt' || value?.provider === 'openrouter' || value?.provider === 'gemini' ? value.provider : 'api',
    codexPath: value?.codexPath?.trim() || DEFAULT_SUBSCRIPTION.codexPath,
    codexModel: value?.codexModel?.trim() || DEFAULT_SUBSCRIPTION.codexModel,
    dailyRequestLimit: typeof limit === 'number' && Number.isFinite(limit)
      ? Math.min(500, Math.max(0, Math.floor(limit))) : DEFAULT_SUBSCRIPTION.dailyRequestLimit,
    pythonPath: value?.pythonPath?.trim() || DEFAULT_SUBSCRIPTION.pythonPath,
    whisperModelPath: value?.whisperModelPath?.trim() || '',
    localTranscription: value?.localTranscription === true
  }
}

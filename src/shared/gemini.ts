/**
 * Google Gemini through its OpenAI-compatible endpoint. Gemini has no
 * /audio/transcriptions route, so Cutawan always transcribes locally with
 * Whisper when Gemini is the analysis provider.
 */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai'
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
export const GEMINI_KEYS_URL = 'https://aistudio.google.com/apikey'

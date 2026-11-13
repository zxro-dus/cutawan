import { useState } from 'react'
import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { DEFAULT_GEMINI_MODEL, GEMINI_KEYS_URL } from '@shared/gemini'
import { useStore } from '../store'

export interface GeminiChoice {
  /** Newly typed key; empty means "keep the stored one". */
  apiKey: string
  model: string
}

/** Gemini key, model and a connection test. Transcription is always local Whisper. */
export default function GeminiSetup({ value, onChange, onSave }: {
  value: GeminiChoice
  onChange: (patch: Partial<GeminiChoice>) => void
  onSave: () => Promise<void>
}): React.JSX.Element {
  const settings = useStore(s => s.settings)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)

  const check = async (): Promise<void> => {
    setChecking(true)
    setStatus(null)
    try {
      await onSave()
      const result = await window.cutawan.checkGeminiConnection()
      setStatus({ ok: true, message: result.message })
    } catch (error) {
      setStatus({ ok: false, message: (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })
    } finally { setChecking(false) }
  }

  return <div className="space-y-4" data-testid="gemini-setup">
    <div>
      <label className="block text-xs" htmlFor="gemini-key">Gemini API key</label>
      <input id="gemini-key" type="password" autoComplete="off" value={value.apiKey}
        onChange={e => { onChange({ apiKey: e.target.value }); setStatus(null) }}
        placeholder={settings?.hasGeminiKey ? `Current: ${settings.geminiKeyMasked}` : 'AIza…'}
        className="mt-1 w-full rounded-lg border border-surface-600 bg-surface-850 px-3 py-2 text-sm" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <a href={GEMINI_KEYS_URL} target="_blank" rel="noreferrer" className="text-xs underline">Create a Gemini key ↗</a>
        {settings?.keyStorageSecure !== false
          ? <span className="flex items-center gap-1 text-[11px] text-zinc-500"><ShieldCheck size={12} /> Encrypted with your system keychain</span>
          : <span className="flex items-center gap-1 text-[11px] text-amber-400"><TriangleAlert size={12} /> No keychain: stored obfuscated only</span>}
      </div>
    </div>
    <div>
      <label className="block text-xs" htmlFor="gemini-model">Analysis model</label>
      <input id="gemini-model" value={value.model} onChange={e => { onChange({ model: e.target.value }); setStatus(null) }}
        placeholder={DEFAULT_GEMINI_MODEL}
        className="mt-1 w-full rounded-lg border border-surface-600 bg-surface-850 px-3 py-2 text-sm" />
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        Default: {DEFAULT_GEMINI_MODEL}. Use any Gemini model name your key can access. Transcript text and
        sampled video frames are sent to Google for analysis.
      </p>
    </div>
    <button type="button" onClick={() => void check()} disabled={checking || (!value.apiKey.trim() && !settings?.hasGeminiKey)}
      className="rounded-lg border border-surface-600 px-3 py-2 text-sm disabled:opacity-50">
      {checking ? 'Checking…' : 'Save and test connection'}
    </button>
    {status && <p role="status" className={`text-xs ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>{status.message}</p>}
  </div>
}

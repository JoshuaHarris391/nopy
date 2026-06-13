import { selectStyle } from '../styles'

/**
 * Model dropdown shared by the hosted-provider blocks (Anthropic, OpenAI).
 * Owns the loading / error / no-key / no-models option states that were
 * previously copy-pasted per dropdown. The local provider keeps its own
 * select — its custom-mode/typed-name flow doesn't fit this shape.
 */
export function ModelSelect({
  value,
  onChange,
  models,
  loading,
  error,
  apiKey,
  emptyOption,
  hideNoModels = false,
}: {
  value: string
  onChange: (value: string) => void
  models: { id: string; displayName: string }[]
  loading: boolean
  error: string | null
  /** Gate: blank key disables the select and shows the "enter key" hint. */
  apiKey: string
  /**
   * Optional value="" entry rendered once the provider is ready.
   * 'when-unset' shows it only until a model is picked (placeholder);
   * 'always' keeps it selectable (e.g. "Use main model").
   */
  emptyOption?: { label: string; mode: 'when-unset' | 'always' }
  /** Suppress the "No models found" fallback (when emptyOption covers it). */
  hideNoModels?: boolean
}) {
  const ready = !loading && !error && !!apiKey
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={loading || !apiKey}
      style={{
        ...selectStyle,
        color: loading || !apiKey ? 'var(--sage)' : 'var(--ink)',
        cursor: loading || !apiKey ? 'not-allowed' : 'pointer',
        minWidth: 200,
      }}
    >
      {loading && <option value="">Loading models…</option>}
      {error && <option value="">{error}</option>}
      {!apiKey && <option value="">Enter API key to load models</option>}
      {ready && emptyOption && (emptyOption.mode === 'always' || !value) && (
        <option value="">{emptyOption.label}</option>
      )}
      {models.map((m) => (
        <option key={m.id} value={m.id}>{m.displayName}</option>
      ))}
      {ready && !hideNoModels && models.length === 0 && (
        <option value="">No models found</option>
      )}
    </select>
  )
}

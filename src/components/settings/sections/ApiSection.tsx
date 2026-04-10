import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { SettingsRow } from '../../ui/SettingsRow'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useAnthropicModels } from '../../../hooks/useAnthropicModels'

export function ApiSection() {
  const apiKey = useSettingsStore((s) => s.apiKey)
  const setApiKey = useSettingsStore((s) => s.setApiKey)
  const preferredModel = useSettingsStore((s) => s.preferredModel)
  const setPreferredModel = useSettingsStore((s) => s.setPreferredModel)
  const maxOutputTokens = useSettingsStore((s) => s.maxOutputTokens)
  const setMaxOutputTokens = useSettingsStore((s) => s.setMaxOutputTokens)
  const contextBudget = useSettingsStore((s) => s.contextBudget)
  const setContextBudget = useSettingsStore((s) => s.setContextBudget)

  const [showKey, setShowKey] = useState(false)
  const [keyInput, setKeyInput] = useState(apiKey)
  const { models, loading: modelsLoading, error: modelsError } = useAnthropicModels(apiKey)

  const selectStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)', fontSize: 13, padding: '6px 12px',
    border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
    background: 'var(--warm-cream)', color: 'var(--ink)',
    outline: 'none', cursor: 'pointer',
  }

  return (
    <SettingsSection title="API Configuration">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)', marginBottom: 4 }}>
          Anthropic API Key
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginBottom: 8 }}>
          Your key stays local and is never sent to any server other than Anthropic's API.
        </div>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onBlur={() => setApiKey(keyInput.trim())}
            placeholder="sk-ant-..."
            style={{
              width: '100%', padding: '9px 40px 9px 13px',
              border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-mono)', fontSize: 12.5,
              color: 'var(--ink)', background: 'var(--warm-cream)',
              outline: 'none', transition: 'border-color var(--transition-gentle)',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--bark)')}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
            style={{ background: 'none', border: 'none', color: 'var(--sage)' }}
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <SettingsRow label="Model" description="Used for chat conversations">
        <select
          value={preferredModel}
          onChange={(e) => setPreferredModel(e.target.value)}
          disabled={modelsLoading || !apiKey}
          style={{
            ...selectStyle,
            color: modelsLoading || !apiKey ? 'var(--sage)' : 'var(--ink)',
            cursor: modelsLoading || !apiKey ? 'not-allowed' : 'pointer',
            minWidth: 200,
          }}
        >
          {modelsLoading && <option value="">Loading models…</option>}
          {modelsError && <option value="">{modelsError}</option>}
          {!apiKey && <option value="">Enter API key to load models</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.displayName}</option>
          ))}
          {!modelsLoading && !modelsError && apiKey && models.length === 0 && (
            <option value="">No models found</option>
          )}
        </select>
      </SettingsRow>

      <SettingsRow label="Max Output Tokens" description="Maximum length of each AI response (default: 4,096)">
        <select value={maxOutputTokens} onChange={(e) => setMaxOutputTokens(Number(e.target.value))} style={selectStyle}>
          <option value={1024}>1,024</option>
          <option value={2048}>2,048</option>
          <option value={4096}>4,096</option>
          <option value={8192}>8,192</option>
          <option value={16384}>16,384</option>
          <option value={32768}>32,768</option>
        </select>
      </SettingsRow>

      <SettingsRow label="Context Budget" description="How much conversation history to send with each message (default: 500,000)">
        <select value={contextBudget} onChange={(e) => setContextBudget(Number(e.target.value))} style={selectStyle}>
          <option value={8000}>8,000</option>
          <option value={30000}>30,000</option>
          <option value={60000}>60,000</option>
          <option value={100000}>100,000</option>
          <option value={200000}>200,000</option>
          <option value={500000}>500,000</option>
          <option value={1000000}>1,000,000</option>
        </select>
      </SettingsRow>
    </SettingsSection>
  )
}

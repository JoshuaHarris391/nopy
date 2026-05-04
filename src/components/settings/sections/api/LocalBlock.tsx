import { useState, useEffect, useMemo } from 'react'
import { SettingsRow } from '../../../ui/SettingsRow'
import { HelpTooltip } from '../../../ui/HelpTooltip'
import { useSettingsStore } from '../../../../stores/settingsStore'
import { useLocalModels } from '../../../../hooks/useLocalModels'
import { LocalStatusIndicator } from './LocalStatusIndicator'
import { LocalOnboardingCard } from './LocalOnboardingCard'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 13px',
  border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-mono)', fontSize: 12.5,
  color: 'var(--ink)', background: 'var(--warm-cream)',
  outline: 'none', transition: 'border-color var(--transition-gentle)',
}

/**
 * Local-mode settings block: status indicator + (conditional) onboarding
 * card + base URL + model name. Reads probe state from `useLocalModels`
 * to derive a single status code that drives both the indicator and
 * (if not 'ready') the onboarding card.
 */
export function LocalBlock() {
  const localBaseUrl = useSettingsStore((s) => s.localBaseUrl)
  const setLocalBaseUrl = useSettingsStore((s) => s.setLocalBaseUrl)
  const localModel = useSettingsStore((s) => s.localModel)
  const setLocalModel = useSettingsStore((s) => s.setLocalModel)

  // Local input state so users can type without committing on every keystroke.
  // Commit on blur (matches the Anthropic API key field pattern).
  const [baseUrlInput, setBaseUrlInput] = useState(localBaseUrl)
  const [modelInput, setModelInput] = useState(localModel)

  useEffect(() => { setBaseUrlInput(localBaseUrl) }, [localBaseUrl])
  useEffect(() => { setModelInput(localModel) }, [localModel])

  const { models, loading, error, refresh } = useLocalModels(localBaseUrl)

  const status = useMemo<{ code: 'loading' | 'not-running' | 'no-model' | 'name-mismatch' | 'ready'; label: string }>(() => {
    if (loading) return { code: 'loading', label: 'Checking LM Studio…' }
    if (error === 'connection-refused' || error === 'timeout' || error === 'http-error') {
      return { code: 'not-running', label: "LM Studio isn't running" }
    }
    if (error === 'no-model-loaded') {
      return { code: 'no-model', label: 'Running, but no model loaded' }
    }
    if (!localModel) return { code: 'no-model', label: 'Pick a model below' }
    if (!models.some((m) => m.id === localModel)) {
      return { code: 'name-mismatch', label: 'Model name doesn\'t match a loaded model' }
    }
    return { code: 'ready', label: 'Ready' }
  }, [loading, error, models, localModel])

  return (
    <div>
      <div style={{ marginTop: 4, marginBottom: 4 }}>
        <LocalStatusIndicator status={status.code} label={status.label} />
      </div>

      {(status.code === 'not-running' || status.code === 'no-model' || status.code === 'name-mismatch') && (
        <LocalOnboardingCard
          status={status.code}
          loadedModels={models}
          onRefresh={refresh}
          refreshing={loading}
        />
      )}

      <SettingsRow
        label={
          <span className="flex items-center">
            Base URL
            <HelpTooltip label="Help: base URL">
              The URL of LM Studio's local server. The default is the address
              LM Studio uses out of the box. If you changed the port in LM
              Studio's Developer tab, paste the new URL here. Ollama users
              can paste <code>http://localhost:11434/v1</code>.
            </HelpTooltip>
          </span>
        }
        description="Default: http://localhost:1234/v1"
      >
        <input
          type="text"
          value={baseUrlInput}
          onChange={(e) => setBaseUrlInput(e.target.value)}
          onBlur={() => setLocalBaseUrl(baseUrlInput.trim())}
          placeholder="http://localhost:1234/v1"
          style={{ ...inputStyle, width: 280 }}
        />
      </SettingsRow>

      <SettingsRow
        label={
          <span className="flex items-center">
            Model
            <HelpTooltip label="Help: model name">
              The exact model id LM Studio reports. After you load a model in
              LM Studio, click "Check again" above and pick from the
              suggestions. Common ids look like
              {' '}<code>google/gemma-4-e4b</code> or
              {' '}<code>lmstudio-community/Gemma-2-2B-it-GGUF</code>.
            </HelpTooltip>
          </span>
        }
        description="Type or pick a model loaded in LM Studio"
      >
        <input
          type="text"
          list="local-model-suggestions"
          value={modelInput}
          onChange={(e) => setModelInput(e.target.value)}
          onBlur={() => setLocalModel(modelInput.trim())}
          placeholder="google/gemma-4-e4b"
          style={{ ...inputStyle, width: 280 }}
        />
        <datalist id="local-model-suggestions">
          {models.map((m) => <option key={m.id} value={m.id} />)}
        </datalist>
      </SettingsRow>
    </div>
  )
}

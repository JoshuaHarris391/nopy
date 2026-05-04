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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  cursor: 'pointer',
  width: 280,
}

const CUSTOM_VALUE = '__nopy_custom__'

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

  // Auto-select the only loaded model so the common case (one model in
  // LM Studio, nothing set in nopy yet) lights up green without the user
  // having to read a dropdown. Skipped when the user already has a model
  // chosen — even if the typed name doesn't match — because they may be
  // mid-edit or about to load that model in LM Studio.
  useEffect(() => {
    if (!localModel && models.length === 1) {
      setLocalModel(models[0].id)
    }
  }, [models, localModel, setLocalModel])

  // Track whether the model field is in "custom" (typed) mode. We're in
  // custom mode when a model is set but it isn't one of the loaded ones —
  // that's how the user signals "I want to type a name, not pick from
  // /v1/models" (e.g. they want to set a name BEFORE loading the model
  // in LM Studio). Empty + models loaded → the dropdown handles it.
  const isCustom = localModel !== '' && models.length > 0 && !models.some((m) => m.id === localModel)
  const [customMode, setCustomMode] = useState(isCustom)
  useEffect(() => { if (isCustom) setCustomMode(true) }, [isCustom])

  const showDropdown = models.length > 0 && !customMode

  // Find the loaded context window for the currently picked model. Only
  // available when LM Studio's native /api/v1/models endpoint is reachable
  // (Ollama users get null and no info is shown — no false alarm).
  // 8192 is the threshold below which nopy's full system prompt almost
  // always overflows; warn the user before they hit a chat-time error.
  const SMALL_CONTEXT_THRESHOLD = 8192
  const selectedModel = models.find((m) => m.id === localModel)
  const loadedCtx = selectedModel?.loadedContextLength ?? null
  const maxCtx = selectedModel?.maxContextLength ?? null
  const ctxWarning = loadedCtx !== null && loadedCtx < SMALL_CONTEXT_THRESHOLD

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
              Where nopy connects to LM Studio. The default works as
              long as LM Studio is open and you've clicked Start Server
              inside it. Only change this if you've moved LM Studio to a
              different port.
            </HelpTooltip>
          </span>
        }
        description="Default: http://localhost:1234/v1 — LM Studio's OpenAI-compatible endpoint"
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
              The model nopy will chat with. Pick from the list of
              models you've loaded in LM Studio. If your model isn't
              loaded yet, choose "Custom…" and type its name — once you
              load it in LM Studio, click "Check again" above and it
              will show up here.
            </HelpTooltip>
          </span>
        }
        description={
          showDropdown
            ? `${models.length} model${models.length === 1 ? '' : 's'} loaded in LM Studio`
            : models.length > 0
              ? 'Custom — type a model id; pick from the dropdown above to switch back'
              : 'No models loaded yet — type a model id, or load one in LM Studio and click "Check again"'
        }
      >
        {showDropdown ? (
          <select
            value={localModel}
            onChange={(e) => {
              const v = e.target.value
              if (v === CUSTOM_VALUE) {
                setCustomMode(true)
                return
              }
              setLocalModel(v)
            }}
            style={selectStyle}
          >
            {/* Placeholder when nothing is set yet AND we have multiple
                models — the user must explicitly pick one. Hidden once a
                value is set so it doesn't crowd the menu. */}
            {!localModel && <option value="" disabled>Pick a model…</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
            <option value={CUSTOM_VALUE}>Custom…</option>
          </select>
        ) : (
          <input
            type="text"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            onBlur={() => setLocalModel(modelInput.trim())}
            placeholder="google/gemma-4-e4b"
            style={{ ...inputStyle, width: 280 }}
          />
        )}
      </SettingsRow>

      {loadedCtx !== null && (
        <SettingsRow
          label={
            <span className="flex items-center">
              Loaded context
              <HelpTooltip label="Help: loaded context">
                How much your model can read at once. nopy sends a fair
                bit of background (your therapy frame, profile, journal
                summaries) so replies stay personal — load your model
                with at least 32,000 to keep things smooth. Below
                roughly 8,000 your chats will fail with a "too long"
                error.
                <br /><br />
                To change it: in LM Studio, click Eject, then re-load
                the model and pick a higher Context Length.
              </HelpTooltip>
            </span>
          }
          description={ctxWarning ? 'Re-load this model in LM Studio with a larger Context Length to avoid chat failures.' : undefined}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 12.5,
              color: ctxWarning ? 'var(--soft-coral)' : 'var(--ink)',
              fontWeight: ctxWarning ? 600 : 400,
            }}
          >
            {loadedCtx.toLocaleString()} tokens
            {maxCtx !== null && maxCtx > loadedCtx && (
              <span style={{ color: 'var(--sage)', fontWeight: 400 }}> · max {maxCtx.toLocaleString()}</span>
            )}
          </span>
        </SettingsRow>
      )}
    </div>
  )
}

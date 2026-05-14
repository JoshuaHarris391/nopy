import { Cloud, HardDrive, Sparkles } from 'lucide-react'
import { useSettingsStore } from '../../../../stores/settingsStore'
import type { LlmProvider } from '../../../../types/settings'

const OPTIONS: { value: LlmProvider; label: string; Icon: typeof Cloud }[] = [
  { value: 'local', label: 'Local (LM Studio)', Icon: HardDrive },
  { value: 'openai', label: 'OpenAI API', Icon: Sparkles },
  { value: 'anthropic', label: 'Anthropic API', Icon: Cloud },
]

/**
 * Segmented two-button picker for the LLM provider. Visual pattern copied
 * from `AppearanceSection` so the settings page reads as one design system.
 * Selecting a provider only updates `settings.provider` — the per-provider
 * config (apiKey vs localBaseUrl/localModel) stays preserved so toggling
 * back and forth doesn't clobber either one's setup.
 */
export function ProviderToggle() {
  const provider = useSettingsStore((s) => s.provider)
  const setProvider = useSettingsStore((s) => s.setProvider)

  return (
    <div
      role="radiogroup"
      aria-label="LLM provider"
      className="flex"
      style={{ border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', width: 'fit-content' }}
    >
      {OPTIONS.map(({ value, label, Icon }, idx) => {
        const active = provider === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setProvider(value)}
            className="flex items-center gap-1.5 cursor-pointer"
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 14px',
              border: 'none',
              borderLeft: idx === 0 ? 'none' : '1px solid var(--stone)',
              background: active ? 'var(--forest)' : 'transparent',
              color: active ? '#fff' : 'var(--ink)',
              transition: 'all var(--transition-gentle)',
            }}
          >
            <Icon size={13} strokeWidth={1.8} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

import { SettingsSection } from '../../ui/SettingsSection'
import { SettingsRow } from '../../ui/SettingsRow'
import { useSettingsStore } from '../../../stores/settingsStore'
import { ProviderToggle } from './api/ProviderToggle'
import { AnthropicBlock } from './api/AnthropicBlock'
import { LocalBlock } from './api/LocalBlock'
import { OpenaiBlock } from './api/OpenaiBlock'

const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 13, padding: '6px 12px',
  border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
  background: 'var(--warm-cream)', color: 'var(--ink)',
  outline: 'none', cursor: 'pointer',
}

/**
 * Top-level API/AI settings. The provider toggle determines which of the
 * three provider blocks (Local LM Studio, OpenAI, Anthropic) is shown
 * beneath it. Max output tokens and context budget apply to whichever
 * provider is active and live below the per-provider block.
 */
export function ApiSection() {
  const provider = useSettingsStore((s) => s.provider)
  const maxOutputTokens = useSettingsStore((s) => s.maxOutputTokens)
  const setMaxOutputTokens = useSettingsStore((s) => s.setMaxOutputTokens)
  const contextBudget = useSettingsStore((s) => s.contextBudget)
  const setContextBudget = useSettingsStore((s) => s.setContextBudget)

  return (
    <SettingsSection title="AI Provider">
      <div style={{ marginBottom: 12 }}>
        <ProviderToggle />
      </div>

      {provider === 'anthropic' ? <AnthropicBlock />
        : provider === 'openai' ? <OpenaiBlock />
        : <LocalBlock />}

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

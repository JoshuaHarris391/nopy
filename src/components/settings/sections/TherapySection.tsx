import { SettingsSection } from '../../ui/SettingsSection'
import { SettingsRow } from '../../ui/SettingsRow'
import { useSettingsStore } from '../../../stores/settingsStore'
import { listTherapies, THERAPIES, type TherapyType } from '../../../services/prompts/therapists'

export function TherapySection() {
  const therapyType = useSettingsStore((s) => s.therapyType)
  const setTherapyType = useSettingsStore((s) => s.setTherapyType)
  const current = THERAPIES[therapyType]

  const selectStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)', fontSize: 13, padding: '6px 12px',
    border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
    background: 'var(--warm-cream)', color: 'var(--ink)',
    outline: 'none', cursor: 'pointer',
    minWidth: 200,
  }

  return (
    <SettingsSection title="Therapy">
      <SettingsRow
        label="Therapy Type"
        description={current?.description ?? 'Select the therapeutic frame used by the chat agent.'}
      >
        <select
          value={therapyType}
          onChange={(e) => setTherapyType(e.target.value as TherapyType)}
          style={selectStyle}
          aria-label="Therapy type"
        >
          {listTherapies().map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </SettingsRow>
    </SettingsSection>
  )
}

import { SettingsSection } from '../../ui/SettingsSection'
import { SettingsRow } from '../../ui/SettingsRow'
import { useSettingsStore } from '../../../stores/settingsStore'
import { listTherapies, THERAPIES, type TherapyType } from '../../../services/prompts/therapists'
import { selectStyle } from './styles'

export function TherapySection() {
  const therapyType = useSettingsStore((s) => s.therapyType)
  const setTherapyType = useSettingsStore((s) => s.setTherapyType)
  const current = THERAPIES[therapyType]

  return (
    <SettingsSection title="Therapy">
      <SettingsRow
        label="Therapy Type"
        description={current?.description ?? 'Select the therapeutic frame used by the chat agent.'}
      >
        <select
          value={therapyType}
          onChange={(e) => setTherapyType(e.target.value as TherapyType)}
          style={{ ...selectStyle, minWidth: 200 }}
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

import { Sun, Moon, Monitor } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { SettingsRow } from '../../ui/SettingsRow'
import { useSettingsStore } from '../../../stores/settingsStore'

type ThemeOption = 'system' | 'light' | 'dark'

const OPTIONS: { value: ThemeOption; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

export function AppearanceSection() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  return (
    <SettingsSection title="Appearance">
      <SettingsRow label="Theme" description="Follow the system, or pick a fixed mode">
        <div className="flex" style={{ border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {OPTIONS.map(({ value, label, Icon }, idx) => {
            const active = theme === value
            return (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className="flex items-center gap-1.5 cursor-pointer"
                style={{
                  fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 12px',
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
      </SettingsRow>
    </SettingsSection>
  )
}

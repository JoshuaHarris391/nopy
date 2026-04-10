import { Sun, Moon } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { SettingsRow } from '../../ui/SettingsRow'
import { useSettingsStore } from '../../../stores/settingsStore'

export function AppearanceSection() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  return (
    <SettingsSection title="Appearance">
      <SettingsRow label="Theme" description="Switch between light and dark mode">
        <div className="flex" style={{ border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <button
            onClick={() => setTheme('light')}
            className="flex items-center gap-1.5 cursor-pointer"
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 12px',
              border: 'none',
              background: theme === 'light' ? 'var(--forest)' : 'transparent',
              color: theme === 'light' ? '#fff' : 'var(--ink)',
              transition: 'all var(--transition-gentle)',
            }}
          >
            <Sun size={13} strokeWidth={1.8} />
            Light
          </button>
          <button
            onClick={() => setTheme('dark')}
            className="flex items-center gap-1.5 cursor-pointer"
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 12px',
              border: 'none', borderLeft: '1px solid var(--stone)',
              background: theme === 'dark' ? 'var(--forest)' : 'transparent',
              color: theme === 'dark' ? '#fff' : 'var(--ink)',
              transition: 'all var(--transition-gentle)',
            }}
          >
            <Moon size={13} strokeWidth={1.8} />
            Dark
          </button>
        </div>
      </SettingsRow>
    </SettingsSection>
  )
}

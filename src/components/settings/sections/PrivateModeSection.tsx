import { Lock } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useIndexingStore } from '../../../stores/indexingStore'

/**
 * The one setting that is always visible: a large card-sized switch that
 * turns nopy into a journal-only app. While on, every AI surface (chat,
 * context, profile, index, provider settings) is hidden and indexing and
 * profile generation are short-circuited at the store level — see
 * `journalStore.processEntries` / `profileStore.generateProfile`.
 */
export function PrivateModeSection() {
  const on = useSettingsStore((s) => s.privateMode)
  const setPrivateMode = useSettingsStore((s) => s.setPrivateMode)

  const toggle = () => {
    // Stop any index run that is mid-flight so nothing else leaves the machine.
    if (!on) useIndexingStore.getState().abort()
    setPrivateMode(!on)
  }

  return (
    <SettingsSection title="Private mode">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '20px 22px',
          border: `1px solid ${on ? 'var(--forest)' : 'var(--stone)'}`,
          background: on ? 'var(--warm-cream)' : 'transparent',
          borderRadius: 'var(--radius-sm)',
          transition: 'all var(--transition-gentle)',
        }}
      >
        <Lock
          size={28}
          strokeWidth={1.5}
          style={{ color: on ? 'var(--forest)' : 'var(--sage)', flexShrink: 0 }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 500, color: 'var(--ink)' }}>
            {on ? 'Private mode is on' : 'Private mode is off'}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)', marginTop: 4, lineHeight: 1.5 }}>
            Hides chat, context, profile and the index, and pauses indexing. Nothing is sent to an AI
            provider while this is on. Your journal is untouched.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Private mode"
          onClick={toggle}
          className="cursor-pointer"
          style={{
            width: 56,
            height: 30,
            borderRadius: 999,
            border: 'none',
            padding: 3,
            background: on ? 'var(--forest)' : 'var(--stone)',
            transition: 'background var(--transition-gentle)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: 'block',
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
              transform: `translateX(${on ? 26 : 0}px)`,
              transition: 'transform var(--transition-gentle)',
            }}
          />
        </button>
      </div>
    </SettingsSection>
  )
}

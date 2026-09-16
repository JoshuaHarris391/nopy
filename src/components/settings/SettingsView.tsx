import { MainHeader } from '../ui/MainHeader'
import { AppearanceSection } from './sections/AppearanceSection'
import { PrivateModeSection } from './sections/PrivateModeSection'
import { TherapySection } from './sections/TherapySection'
import { ApiSection } from './sections/ApiSection'
import { DataPrivacySection } from './sections/DataPrivacySection'
import { MaintenanceSection } from './sections/MaintenanceSection'
import { useSettingsStore } from '../../stores/settingsStore'

export function SettingsView() {
  // Private mode hides every AI-related section; the toggle itself always shows.
  const privateMode = useSettingsStore((s) => s.privateMode)

  return (
    <>
      <MainHeader title="Settings" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '36px 44px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <AppearanceSection />
          <PrivateModeSection />
          {!privateMode && <TherapySection />}
          {!privateMode && <ApiSection />}
          <DataPrivacySection />
          {!privateMode && <MaintenanceSection />}

          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 14 }}>
              About
            </h3>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)', lineHeight: 1.6 }}>
              nopy — shelter for your inner world. An open-source, locally-deployed AI-assisted journaling app. Your data never leaves your machine.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

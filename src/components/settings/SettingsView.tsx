import { MainHeader } from '../ui/MainHeader'

export function SettingsView() {
  return (
    <>
      <MainHeader title="Settings" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '44px' }}>
        <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--sage)' }}>Settings controls will appear here.</p>
      </div>
    </>
  )
}

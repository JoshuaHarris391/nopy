import { MainHeader } from '../ui/MainHeader'

export function ProfileView() {
  return (
    <>
      <MainHeader title="Profile" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '44px' }}>
        <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--sage)' }}>Profile details will appear here.</p>
      </div>
    </>
  )
}

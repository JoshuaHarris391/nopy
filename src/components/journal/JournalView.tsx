import { MainHeader } from '../ui/MainHeader'

export function JournalView() {
  return (
    <>
      <MainHeader title="Journal" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '44px' }}>
        <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--sage)' }}>Journal entries will appear here.</p>
      </div>
    </>
  )
}

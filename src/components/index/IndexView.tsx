import { MainHeader } from '../ui/MainHeader'

export function IndexView() {
  return (
    <>
      <MainHeader title="Index" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '44px' }}>
        <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--sage)' }}>Index entries will appear here.</p>
      </div>
    </>
  )
}

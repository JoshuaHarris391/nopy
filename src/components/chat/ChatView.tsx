import { MainHeader } from '../ui/MainHeader'

export function ChatView() {
  return (
    <>
      <MainHeader title="Chat" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '44px' }}>
        <p style={{ fontFamily: 'var(--font-ui)', color: 'var(--sage)' }}>Chat conversations will appear here.</p>
      </div>
    </>
  )
}

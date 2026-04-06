import { formatDistanceToNow } from 'date-fns'
import { Plus } from 'lucide-react'
import type { ChatSessionMeta } from '../../types/chat'

interface ChatSessionListProps {
  sessions: ChatSessionMeta[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
}

export function ChatSessionList({ sessions, activeSessionId, onSelect, onCreate }: ChatSessionListProps) {
  const activeSessions = sessions.filter((s) => s.status === 'active')

  return (
    <div
      className="flex flex-col border-r overflow-hidden h-full"
      style={{ width: 260, background: 'var(--warm-cream)', borderColor: 'var(--stone)' }}
    >
      <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--stone)' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--sage)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Sessions
        </span>
        <button
          onClick={onCreate}
          className="flex items-center justify-center cursor-pointer"
          style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'transparent', border: 'none', color: 'var(--sage)', transition: 'all var(--transition-gentle)' }}
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeSessions.length === 0 ? (
          <div className="p-4 text-center" style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)' }}>
            No conversations yet
          </div>
        ) : (
          activeSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelect(session.id)}
              className="w-full text-left cursor-pointer block"
              style={{
                padding: '12px 14px',
                background: session.id === activeSessionId ? 'var(--parchment)' : 'transparent',
                border: 'none',
                borderLeftStyle: 'solid',
                borderLeftWidth: 3,
                borderLeftColor: session.id === activeSessionId ? 'var(--amber)' : 'transparent',
                transition: 'all var(--transition-gentle)',
              }}
            >
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session.title}
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--sage)' }}>
                {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
                {session.messageCount > 0 && ` · ${session.messageCount} msgs`}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

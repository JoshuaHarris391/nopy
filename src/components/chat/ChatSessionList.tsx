import { useState, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { ChatSessionMeta } from '../../types/chat'

interface ChatSessionListProps {
  sessions: ChatSessionMeta[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  generatingTitleId: string | null
}

export function ChatSessionList({ sessions, activeSessionId, onSelect, onCreate, onRename, onDelete, generatingTitleId }: ChatSessionListProps) {
  const activeSessions = sessions.filter((s) => s.status === 'active')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.focus()
  }, [editingId])

  const startRename = (session: ChatSessionMeta, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(session.id)
    setEditValue(session.title)
  }

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim())
    }
    setEditingId(null)
  }

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
              className="w-full text-left cursor-pointer block group"
              style={{
                padding: '12px 14px',
                background: session.id === activeSessionId ? 'var(--parchment)' : 'transparent',
                border: 'none',
                borderLeftStyle: 'solid',
                borderLeftWidth: 3,
                borderLeftColor: session.id === activeSessionId ? 'var(--amber)' : 'transparent',
                transition: 'all var(--transition-gentle)',
                position: 'relative',
              }}
            >
              {editingId === session.id ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, color: 'var(--ink)',
                    width: '100%', background: 'white', border: '1px solid var(--stone)',
                    borderRadius: 'var(--radius-sm)', padding: '2px 6px', outline: 'none',
                  }}
                />
              ) : (
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {session.title}
                    {generatingTitleId === session.id && (
                      <Loader2 size={12} color="var(--sage)" className="animate-spin" style={{ flexShrink: 0 }} />
                    )}
                  </div>
                  <div
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1"
                    style={{ transition: 'opacity 150ms', flexShrink: 0 }}
                  >
                    <Pencil
                      size={12}
                      color="var(--sage)"
                      onClick={(e) => startRename(session, e)}
                      style={{ cursor: 'pointer' }}
                    />
                    <Trash2
                      size={12}
                      color="var(--sage)"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(session.id)
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </div>
                </div>
              )}
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

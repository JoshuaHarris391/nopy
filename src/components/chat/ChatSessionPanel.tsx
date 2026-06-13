import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { ChatSessionList } from './ChatSessionList'
import type { ChatSessionMeta } from '../../types/chat'

/**
 * Collapsible session-list panel plus its toggle strip. On narrow screens
 * the panel overlays the chat; the toggle stays visible either way so
 * sessions remain reachable.
 */
export function ChatSessionPanel({
  collapsed,
  onToggle,
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  generatingTitleId,
}: {
  collapsed: boolean
  onToggle: () => void
  sessions: ChatSessionMeta[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  generatingTitleId: string | null
}) {
  return (
    <>
      {/* Session list - collapsible; overlays chat on narrow screens */}
      <div
        className="flex h-full flex-shrink-0 relative lg:static absolute top-0 left-0 z-20 lg:z-auto lg:shadow-none"
        style={{
          width: collapsed ? 0 : 300,
          maxWidth: '85vw',
          height: '100%',
          overflow: 'hidden',
          transition: 'width 200ms ease',
          boxShadow: collapsed ? 'none' : '2px 0 8px rgba(0,0,0,0.08)',
        }}
      >
        <ChatSessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDelete={onDelete}
          generatingTitleId={generatingTitleId}
        />
      </div>

      {/* Session panel toggle - always visible so sessions stay reachable on narrow screens */}
      <button
        className="flex items-center justify-center flex-shrink-0 cursor-pointer relative z-30"
        onClick={onToggle}
        style={{
          width: 20,
          background: 'var(--warm-cream)',
          border: 'none',
          borderRight: '1px solid var(--stone)',
          color: 'var(--sage)',
          transition: 'color 150ms ease, background 150ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--forest)'
          e.currentTarget.style.background = 'var(--parchment)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--sage)'
          e.currentTarget.style.background = 'var(--warm-cream)'
        }}
        title={collapsed ? 'Show sessions' : 'Hide sessions'}
      >
        {collapsed
          ? <PanelLeftOpen size={12} strokeWidth={1.5} />
          : <PanelLeftClose size={12} strokeWidth={1.5} />
        }
      </button>
    </>
  )
}

import { MessageCircle, Leaf } from 'lucide-react'
import { ChatMessage } from './ChatMessage'
import type { ChatSession } from '../../types/chat'
import type { LlmConfig } from '../../services/llm'

/**
 * Scrollable chat body: the message list for the active session, or the
 * empty state (with provider-specific setup copy) when there is none.
 * Scroll refs/handlers are owned by the parent's useChatScroll so send
 * actions can snap the same container.
 */
export function ChatMessageList({
  session,
  ready,
  provider,
  onNewSession,
  scrollContainerRef,
  onScroll,
  messagesEndRef,
}: {
  session: ChatSession | null
  ready: boolean
  provider: LlmConfig['provider']
  onNewSession: () => void
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto"
      style={{ padding: '36px 44px 0 44px' }}
    >
      <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto' }}>
        {!session ? (
          // Empty state
          <div className="flex flex-col items-center justify-center text-center" style={{ paddingTop: 120 }}>
            <div
              className="flex items-center justify-center"
              style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'linear-gradient(135deg, var(--bark), var(--amber))',
                marginBottom: 16,
              }}
            >
              <Leaf size={24} color="white" strokeWidth={1.8} />
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--ink)', marginBottom: 8 }}>
              Start a conversation
            </h3>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--sage)', maxWidth: 320, marginBottom: 20 }}>
              {ready
                ? "Share what's on your mind. I'm here to listen and help you explore your thoughts."
                : provider === 'local'
                  ? 'Pick a local model in Settings to begin chatting.'
                  : provider === 'openai'
                    ? 'Add your OpenAI API key and pick a model in Settings to begin chatting.'
                    : 'Add your Anthropic API key in Settings to begin chatting.'}
            </p>
            {ready && (
              <button
                onClick={onNewSession}
                className="cursor-pointer flex items-center gap-2"
                style={{
                  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
                  padding: '7px 16px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--forest)', color: 'white', border: 'none',
                  boxShadow: '0 2px 6px rgba(91, 127, 94, 0.22)',
                }}
              >
                <MessageCircle size={14} strokeWidth={2} />
                New conversation
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex flex-col" style={{ gap: 32 }}>
              {session.messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
            </div>
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  )
}

import { format } from 'date-fns'
import { marked } from 'marked'
import type { ChatMessage as ChatMessageType } from '../../types/chat'

marked.setOptions({ breaks: true })

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAgent = message.role === 'assistant'

  return (
    <div style={{ animation: 'msgIn 350ms ease-out' }}>
      <div
        className={isAgent ? 'chat-message-content' : undefined}
        style={
          isAgent
            ? {
                fontFamily: 'var(--font-body)',
                fontSize: 20,
                lineHeight: 1.8,
                color: 'var(--manuscript)',
                fontWeight: 400,
              }
            : {
                background: 'var(--warm-cream)',
                borderRadius: 8,
                padding: '20px 24px',
                fontFamily: 'var(--font-body)',
                fontSize: 18,
                lineHeight: 1.7,
                color: 'var(--ink)',
              }
        }
      >
        {message.streaming && message.content === ''
          ? <TypingDots />
          : <span dangerouslySetInnerHTML={{ __html: marked.parse(message.content) as string }} />}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 10.5,
          color: 'var(--stone)',
          marginTop: 6,
        }}
      >
        {format(new Date(message.timestamp), 'h:mm a')}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rounded-full inline-block"
          style={{
            width: 6,
            height: 6,
            background: 'var(--forest)',
            animation: `typing 1.5s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  )
}

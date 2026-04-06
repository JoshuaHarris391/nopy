import { format } from 'date-fns'
import { AgentAvatar } from './AgentAvatar'
import type { ChatMessage as ChatMessageType } from '../../types/chat'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAgent = message.role === 'assistant'

  return (
    <div
      className={`flex gap-3 ${isAgent ? 'self-start' : 'self-end flex-row-reverse'}`}
      style={{ maxWidth: '88%', animation: 'msgIn 350ms ease-out' }}
    >
      {isAgent && <AgentAvatar />}
      <div>
        <div
          style={
            isAgent
              ? {
                  padding: '14px 18px',
                  borderLeft: '2px solid var(--bark)',
                  fontFamily: 'var(--font-agent)',
                  fontSize: 14.5,
                  lineHeight: 1.7,
                  color: 'var(--manuscript)',
                  fontWeight: 400,
                  whiteSpace: 'pre-wrap',
                }
              : {
                  background: 'var(--warm-cream)',
                  border: '1px solid var(--stone)',
                  padding: '13px 17px',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--ink)',
                  whiteSpace: 'pre-wrap',
                }
          }
        >
          {message.content}
          {message.streaming && message.content === '' && <TypingDots />}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 10.5,
            color: 'var(--stone)',
            marginTop: 5,
            textAlign: isAgent ? 'left' : 'right',
          }}
        >
          {format(new Date(message.timestamp), 'h:mm a')}
        </div>
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
            background: 'var(--bark)',
            animation: `typing 1.5s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  )
}

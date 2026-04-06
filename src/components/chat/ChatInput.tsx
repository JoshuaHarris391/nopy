import { useState, useRef, useCallback } from 'react'
import { Send } from 'lucide-react'

interface ChatInputProps {
  onSend: (content: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-grow
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 100) + 'px'
  }

  return (
    <div style={{ padding: '14px 0 0', borderTop: '1px solid var(--stone)' }}>
      <div
        className="flex items-end gap-2.5"
        style={{
          background: 'var(--warm-cream)',
          border: '1px solid var(--stone)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
          transition: 'border-color var(--transition-gentle), box-shadow var(--transition-gentle)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--bark)'
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 115, 85, 0.08)'
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.style.borderColor = 'var(--stone)'
            e.currentTarget.style.boxShadow = 'none'
          }
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="What's on your mind?"
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-ui)',
            fontSize: 14,
            color: 'var(--ink)',
            outline: 'none',
            resize: 'none',
            minHeight: 22,
            maxHeight: 100,
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="flex items-center justify-center flex-shrink-0 cursor-pointer"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: value.trim() ? 'var(--forest)' : 'var(--stone)',
            border: 'none',
            transition: 'all var(--transition-gentle)',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Send size={15} color="white" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

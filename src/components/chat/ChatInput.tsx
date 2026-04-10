import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'

interface ChatInputProps {
  onSend: (content: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
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
    const el = e.target
    // Measure desired height without visible reflow:
    // overflow hidden prevents the container from shifting during measurement
    el.style.overflow = 'hidden'
    el.style.height = '0'
    const next = Math.max(el.scrollHeight, 60)
    el.style.height = next + 'px'
    el.style.overflow = ''
  }

  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus()
    }
  }, [disabled])

  const hasText = value.trim().length > 0

  return (
    <div
      style={{
        marginTop: 32,
        paddingBottom: 48,
        position: 'relative',
        borderTop: focused ? '2px solid var(--forest)' : '2px solid var(--stone)',
        transition: 'border-color 200ms ease-out',
        paddingTop: 16,
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Share what's on your mind..."
        disabled={disabled}
        rows={1}
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          fontFamily: 'var(--font-body)',
          fontSize: 20,
          lineHeight: 1.8,
          color: 'var(--ink)',
          outline: 'none',
          resize: 'none',
          minHeight: 60,
          caretColor: 'var(--forest)',
        }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !hasText}
        className="flex items-center justify-center cursor-pointer"
        style={{
          position: 'absolute',
          bottom: 52,
          right: 0,
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'transparent',
          border: 'none',
          color: 'var(--forest)',
          opacity: hasText && !disabled ? 1 : 0,
          transition: 'opacity 200ms ease-out',
          pointerEvents: hasText && !disabled ? 'auto' : 'none',
        }}
      >
        <ArrowUp size={18} strokeWidth={2} />
      </button>
    </div>
  )
}

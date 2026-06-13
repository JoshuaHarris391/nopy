import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/**
 * API key field shared by the Anthropic and OpenAI blocks: label +
 * privacy note + password input with show/hide toggle. Edits are local
 * state; the trimmed value is committed to the store on blur so we don't
 * persist (and re-probe models with) every keystroke.
 */
export function ApiKeyField({
  label,
  description,
  placeholder,
  initialValue,
  onCommit,
}: {
  label: string
  description: string
  placeholder: string
  initialValue: string
  onCommit: (value: string) => void
}) {
  const [showKey, setShowKey] = useState(false)
  const [keyInput, setKeyInput] = useState(initialValue)

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginBottom: 8 }}>
        {description}
      </div>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onBlur={() => onCommit(keyInput.trim())}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '9px 40px 9px 13px',
            border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)', fontSize: 12.5,
            color: 'var(--ink)', background: 'var(--warm-cream)',
            outline: 'none', transition: 'border-color var(--transition-gentle)',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--bark)')}
        />
        <button
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
          style={{ background: 'none', border: 'none', color: 'var(--sage)' }}
        >
          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

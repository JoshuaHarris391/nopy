import { useEffect, useRef, useState } from 'react'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'
import { Button } from './Button'

interface NewJournalDialogProps {
  onCreate: (name: string) => void | Promise<void>
  onCancel: () => void
}

export function NewJournalDialog({ onCreate, onCancel }: NewJournalDialogProps) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => { prevFocusRef.current?.focus() }
  }, [])

  useKeyboardShortcut('escape', onCancel)

  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0

  const submit = () => {
    if (canSubmit) void onCreate(trimmed)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create a new journal"
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(44, 62, 44, 0.3)' }}
      onClick={onCancel}
    >
      <div
        className="flex flex-col gap-4"
        style={{
          background: 'var(--parchment)', border: '1px solid var(--stone)',
          borderRadius: 'var(--radius-lg)', padding: '28px 32px',
          maxWidth: 440, width: '90%', boxShadow: '0 12px 40px var(--shadow-warm-deep)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
          Create a new journal
        </h3>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.6 }}>
          Give the journal a name. You'll be asked to pick a location next, and an empty folder will be created there.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="e.g. travel-log-2026"
          style={{
            fontFamily: 'var(--font-ui)', fontSize: 14, padding: '8px 12px',
            border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
            background: 'var(--paper)', color: 'var(--ink)', outline: 'none',
          }}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>Continue</Button>
        </div>
      </div>
    </div>
  )
}

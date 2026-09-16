import { useEffect, useRef, useState } from 'react'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'
import { Button } from './Button'

interface RenameEntryDialogProps {
  /** Title to pre-fill the input with (the colliding title), so the user can append to it. */
  currentTitle: string
  /** The title that collided — shown in the message and rejected as an unchanged value. */
  conflictTitle: string
  onRename: (newTitle: string) => void | Promise<void>
  onCancel: () => void
}

export function RenameEntryDialog({ currentTitle, conflictTitle, onRename, onCancel }: RenameEntryDialogProps) {
  const [name, setName] = useState(currentTitle)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null
    const input = inputRef.current
    if (input) {
      input.focus()
      // Place the cursor at the end (rather than select-all) so the user can
      // immediately append to the existing title, e.g. "2026-06-29 evening".
      input.setSelectionRange(input.value.length, input.value.length)
    }
    return () => { prevFocusRef.current?.focus() }
  }, [])

  useKeyboardShortcut('escape', onCancel)

  const trimmed = name.trim()
  // An unchanged title would just collide again, so require a real change.
  const canSubmit = trimmed.length > 0 && trimmed !== conflictTitle.trim()

  const submit = () => {
    if (canSubmit) void onRename(trimmed)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rename entry"
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(44, 62, 44, 0.3)' }}
    >
      <div
        className="flex flex-col gap-4"
        style={{
          background: 'var(--parchment)', border: '1px solid var(--stone)',
          borderRadius: 'var(--radius-lg)', padding: '28px 32px',
          maxWidth: 440, width: '90%', boxShadow: '0 12px 40px var(--shadow-warm-deep)',
        }}
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
          Name already in use
        </h3>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.6 }}>
          An entry named “{conflictTitle}” already exists in this journal. Choose a different title so this entry doesn’t overwrite it.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="New title"
          style={{
            fontFamily: 'var(--font-ui)', fontSize: 14, padding: '8px 12px',
            border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
            background: 'var(--paper)', color: 'var(--ink)', outline: 'none',
          }}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>Save</Button>
        </div>
      </div>
    </div>
  )
}

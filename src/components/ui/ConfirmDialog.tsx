import { useEffect, useRef } from 'react'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  body: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, body, confirmLabel = 'Delete', danger = true, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => { prevFocusRef.current?.focus() }
  }, [open])

  useKeyboardShortcut('escape', () => {
    if (open) onCancel()
  })

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(44, 62, 44, 0.3)' }}
      onClick={onCancel}
    >
      <div
        className="flex flex-col gap-4"
        style={{
          background: 'var(--parchment)', border: '1px solid var(--stone)',
          borderRadius: 'var(--radius-lg)', padding: '28px 32px',
          maxWidth: 420, boxShadow: '0 12px 40px var(--shadow-warm-deep)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
          {title}
        </h3>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.6 }}>
          {body}
        </p>
        <div className="flex gap-2 justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

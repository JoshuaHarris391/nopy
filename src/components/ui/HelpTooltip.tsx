import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'

interface HelpTooltipProps {
  /** Tooltip body. Plain text or React nodes; rendered inside a styled popover. */
  children: React.ReactNode
  /**
   * Optional max width override (px). Default 360 — wide enough that
   * 2-3 sentences of help copy don't wrap into a tall narrow column,
   * narrow enough to feel like an annotation rather than a card.
   * Pass a smaller number for short single-line labels.
   */
  maxWidth?: number
  /** Aria-label for the trigger button (e.g. "Help: base URL"). */
  label?: string
}

/**
 * Click-to-open help popover. Closes on outside-click. Used wherever a
 * settings field needs an explanation that's too long for the row's
 * description text but doesn't deserve its own modal.
 *
 * The popover renders into a React portal at document.body with
 * `position: fixed` so it escapes every ancestor's flex / overflow /
 * width constraints. Without the portal, SettingsRow's left flex
 * column would squeeze the popover into a tall narrow strip whenever
 * the right column had real content — exactly the bug the user hit.
 *
 * Theming: background uses `var(--ink)` and text uses `var(--parchment)`.
 * Both tokens swap roles between light and dark mode (light mode: ink is
 * dark green-black, parchment is cream → dark tooltip with cream text;
 * dark mode: ink is cream, parchment is dark navy → cream tooltip with
 * dark text). Always readable, no hardcoded `#fff`.
 */
export function HelpTooltip({ children, maxWidth = 360, label = 'Help' }: HelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Recompute position when opening AND when the popover's own size
  // settles (so we can flip it leftward if it would overflow the right
  // edge). useLayoutEffect runs before paint so there's no flash.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const btn = buttonRef.current.getBoundingClientRect()
    const pop = popoverRef.current?.getBoundingClientRect()
    const popWidth = pop?.width ?? maxWidth
    const margin = 8
    // Default: anchor popover's left edge to button's left edge, 6px below.
    let left = btn.left
    // If that overflows the right edge of the viewport, shift left so the
    // popover's right edge sits `margin` from the viewport's right edge.
    if (left + popWidth + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - popWidth - margin)
    }
    setPosition({ top: btn.bottom + 6, left })
  }, [open, maxWidth])

  // Click-outside closes. We check both refs so clicking inside the
  // popover (e.g. selecting text) doesn't dismiss it.
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 6 }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'none', border: 'none', padding: 2, cursor: 'pointer',
          color: 'var(--sage)', display: 'inline-flex', alignItems: 'center',
        }}
      >
        <HelpCircle size={14} strokeWidth={1.8} />
      </button>
      {open && position && createPortal(
        <div
          ref={popoverRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            maxWidth,
            padding: '12px 14px',
            background: 'var(--ink)',
            color: 'var(--parchment)',
            fontFamily: 'var(--font-ui)',
            fontSize: 12.5,
            lineHeight: 1.55,
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            zIndex: 9999,
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </span>
  )
}

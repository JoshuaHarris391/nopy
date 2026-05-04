import { useState, useRef, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'

interface HelpTooltipProps {
  /** Tooltip body. Plain text or React nodes; rendered inside a styled popover. */
  children: React.ReactNode
  /**
   * Optional max width override (px). Default 560 — wide enough that
   * 2-3 sentences of help copy don't wrap into a tall, hard-to-scan
   * column. Pass a smaller number for short single-line labels.
   */
  maxWidth?: number
  /** Aria-label for the trigger button (e.g. "Help: base URL"). */
  label?: string
}

/**
 * Click-to-open help popover. Closes on outside-click. Used wherever a
 * settings field needs an explanation that's too long for the row's
 * description text but doesn't deserve its own modal — e.g. the Local
 * provider's base-URL and model-name inputs.
 *
 * Theming: background uses `var(--ink)` and text uses `var(--parchment)`.
 * Both tokens swap roles between light and dark mode (light mode: ink is
 * dark green-black, parchment is cream → dark tooltip with cream text;
 * dark mode: ink is cream, parchment is dark navy → cream tooltip with
 * dark text). Always readable, no hardcoded `#fff`.
 */
export function HelpTooltip({ children, maxWidth = 560, label = 'Help' }: HelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <span ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 6 }}>
      <button
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
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            maxWidth,
            padding: '10px 12px',
            background: 'var(--ink)',
            color: 'var(--parchment)',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            lineHeight: 1.5,
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 4px 12px var(--shadow-warm-hover)',
            zIndex: 50,
          }}
        >
          {children}
        </div>
      )}
    </span>
  )
}

import { useState, useRef, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'

interface HelpTooltipProps {
  /** Tooltip body. Plain text or React nodes; rendered inside a styled popover. */
  children: React.ReactNode
  /** Optional max width override (px). Default 280. */
  maxWidth?: number
  /** Aria-label for the trigger button (e.g. "Help: base URL"). */
  label?: string
}

/**
 * Click-to-open help popover. Closes on outside-click. Used wherever a
 * settings field needs an explanation that's too long for the row's
 * description text but doesn't deserve its own modal — e.g. the Local
 * provider's base-URL and model-name inputs.
 */
export function HelpTooltip({ children, maxWidth = 280, label = 'Help' }: HelpTooltipProps) {
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
            color: '#fff',
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

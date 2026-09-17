import { ArrowLeft } from 'lucide-react'

interface BackButtonProps {
  /** The page it returns to, e.g. "Index" or "September 2026". */
  label: string
  onClick: () => void
}

/**
 * The header's back arrow. Icon-only: a left arrow at the top-left of a page
 * needs no caption, and the destination lives in the tooltip and aria-label.
 * Negative left margin keeps the glyph on the 44px content column so titles
 * on drilled-in pages start one step to the right rather than on a new grid.
 */
export function BackButton({ label, onClick }: BackButtonProps) {
  const name = `Back to ${label}`
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      title={name}
      className="nopy-focus nopy-back flex items-center justify-center flex-shrink-0"
      style={{
        width: 32, height: 32, padding: 0, marginLeft: -8, marginRight: 8,
        borderRadius: 'var(--radius-sm)', background: 'transparent', border: 'none',
        color: 'var(--sage)', cursor: 'pointer',
        transition: 'color var(--transition-fast), background var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--forest)'
        e.currentTarget.style.background = 'var(--warm-cream)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--sage)'
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <ArrowLeft size={18} strokeWidth={1.8} />
    </button>
  )
}

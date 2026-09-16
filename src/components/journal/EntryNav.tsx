import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthPath, type MonthRef } from '../../services/journalBooks'

export interface Neighbour {
  id: string
  createdAt: string
}

interface EntryNavProps {
  /** The older entry, or null at the oldest. */
  prev: Neighbour | null
  /** The newer entry, or null at the newest. */
  next: Neighbour | null
  /** The month this entry lives in; links back to its scroll. */
  location: MonthRef | null
  disabled?: boolean
  onPrev: () => void
  onNext: () => void
}

const MOD = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+'

/** ‹ Sep 2026 › : flip between diary pages from the editor header. */
export function EntryNav({ prev, next, location, disabled = false, onPrev, onNext }: EntryNavProps) {
  return (
    <div className="flex items-center" style={{ gap: 2, marginRight: 4 }}>
      <NavChevron dir="prev" target={prev} disabled={disabled} onClick={onPrev} />
      {location && (
        <Link
          to={monthPath(location)}
          title="Back to this month"
          className="nopy-focus no-underline"
          style={{
            fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--sage)',
            padding: '4px 8px', minWidth: 64, textAlign: 'center', borderRadius: 'var(--radius-sm)',
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--forest)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--sage)')}
        >
          {format(new Date(location.year, location.month - 1, 1), 'MMM yyyy')}
        </Link>
      )}
      <NavChevron dir="next" target={next} disabled={disabled} onClick={onNext} />
    </div>
  )
}

function NavChevron({ dir, target, disabled, onClick }: { dir: 'prev' | 'next'; target: Neighbour | null; disabled: boolean; onClick: () => void }) {
  const inert = disabled || !target
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  const label = dir === 'prev' ? 'Previous entry' : 'Next entry'
  const key = dir === 'prev' ? '[' : ']'
  const when = target ? format(new Date(target.createdAt), 'd MMM yyyy') : null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inert}
      aria-label={when ? `${label}, ${when}` : label}
      aria-keyshortcuts={`Meta+${key}`}
      title={when ? `${label}: ${when}  (${MOD}${key})` : dir === 'prev' ? 'This is the oldest entry' : 'This is the newest entry'}
      className="nopy-focus flex items-center justify-center"
      style={{
        width: 32, height: 32, padding: 0, borderRadius: 'var(--radius-sm)',
        background: 'transparent', border: '1px solid var(--stone)',
        color: inert ? 'var(--stone)' : 'var(--sage)',
        cursor: inert ? 'default' : 'pointer',
        transition: 'all var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        if (!inert) {
          e.currentTarget.style.color = 'var(--forest)'
          e.currentTarget.style.background = 'var(--warm-cream)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = inert ? 'var(--stone)' : 'var(--sage)'
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <Icon size={16} strokeWidth={1.8} />
    </button>
  )
}

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { RANGES, type Range } from '../../utils/timeSeries'

const TAB_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, padding: '4px 12px',
  borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px solid var(--stone)',
  background: 'transparent', color: 'var(--ink)', transition: 'all var(--transition-gentle)', userSelect: 'none',
}
const TAB_ACTIVE: React.CSSProperties = { ...TAB_STYLE, background: 'var(--forest)', color: 'white', border: '1px solid var(--forest)' }
const NAV_BTN: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  padding: '4px 6px', display: 'inline-flex', alignItems: 'center', color: 'var(--ink)', transition: 'all var(--transition-gentle)',
}

const LABELS: Record<Range, string> = { week: 'Week', month: 'Month', year: 'Year', all: 'All' }

interface RangePickerProps {
  range: Range
  offset: number
  label: string
  onRangeChange: (r: Range) => void
  onOffsetChange: (o: number) => void
}

/** One page-level time control: range tabs plus previous/next, disabled for "All". */
export function RangePicker({ range, offset, label, onRangeChange, onOffsetChange }: RangePickerProps) {
  const isAll = range === 'all'
  return (
    <div className="flex flex-wrap items-center justify-between" style={{ gap: 10 }}>
      <div role="tablist" aria-label="Period" style={{ display: 'flex', gap: 4 }}>
        {RANGES.map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={range === r}
            style={range === r ? TAB_ACTIVE : TAB_STYLE}
            onClick={() => { onRangeChange(r); onOffsetChange(0) }}
          >
            {LABELS[r]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button aria-label="Previous period" style={{ ...NAV_BTN, opacity: isAll ? 0.4 : 1 }} disabled={isAll} onClick={() => onOffsetChange(offset - 1)}>
          <ChevronLeft size={14} />
        </button>
        <span data-testid="window-label" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--manuscript)', minWidth: 150, textAlign: 'center' }}>
          {label}
        </span>
        <button aria-label="Next period" style={{ ...NAV_BTN, opacity: isAll || offset >= 0 ? 0.4 : 1 }} disabled={isAll || offset >= 0} onClick={() => onOffsetChange(Math.min(0, offset + 1))}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

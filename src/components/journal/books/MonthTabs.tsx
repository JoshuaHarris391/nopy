import { monthLabel, type MonthBucket } from '../../../services/journalBooks'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const MONTH_PANEL_ID = 'month-panel'

interface MonthTabsProps {
  year: number
  /** Sparse: only months with entries. */
  months: MonthBucket[]
  /** 1–12 */
  selected: number
  /** The current calendar month when this book is the current year. */
  today: number | null
  orientation: 'vertical' | 'horizontal'
  onSelect: (month: number) => void
}

/**
 * A diary's thumb index. Twelve tabs; the ones with nothing written are
 * muted and not focusable. Arrow keys move between written months and select
 * as they go; focus follows because the buttons keep their identity across
 * the route change.
 */
export function MonthTabs({ year, months, selected, today, orientation, onSelect }: MonthTabsProps) {
  const vertical = orientation === 'vertical'
  const countByMonth = new Map(months.map((m) => [m.month, m.count]))
  const enabled = MONTHS.map((_, i) => i + 1).filter((m) => (countByMonth.get(m) ?? 0) > 0)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (enabled.length === 0) return
    const next = vertical ? 'ArrowDown' : 'ArrowRight'
    const prev = vertical ? 'ArrowUp' : 'ArrowLeft'
    const i = enabled.indexOf(selected)
    let target: number | undefined
    if (e.key === next) target = enabled[(i + 1) % enabled.length]
    else if (e.key === prev) target = enabled[(i - 1 + enabled.length) % enabled.length]
    else if (e.key === 'Home') target = enabled[0]
    else if (e.key === 'End') target = enabled[enabled.length - 1]
    if (target !== undefined && target !== selected) {
      e.preventDefault()
      onSelect(target)
    }
  }

  return (
    <div
      role="tablist"
      aria-label={`Months of ${year}`}
      aria-orientation={orientation}
      onKeyDown={onKeyDown}
      className={vertical ? 'flex flex-col flex-shrink-0' : 'flex flex-shrink-0'}
      style={vertical
        ? { width: 64, gap: 3, paddingTop: 24, borderLeft: '1px solid var(--stone)', overflow: 'visible' }
        : { gap: 6, padding: '10px 44px', borderBottom: '1px solid var(--stone)', overflowX: 'auto', scrollbarWidth: 'none' }}
    >
      {MONTHS.map((name, i) => {
        const month = i + 1
        const count = countByMonth.get(month) ?? 0
        const empty = count === 0
        const active = month === selected
        const full = monthLabel(month)
        const countLabel = `${count} ${count === 1 ? 'entry' : 'entries'}`
        return (
          <button
            key={month}
            role="tab"
            type="button"
            id={`month-tab-${month}`}
            aria-selected={active}
            aria-controls={MONTH_PANEL_ID}
            aria-label={empty ? `${full}, no entries` : `${full}, ${countLabel}`}
            title={empty ? `${full}: nothing written` : `${full} · ${countLabel}`}
            tabIndex={active ? 0 : -1}
            disabled={empty}
            onClick={() => onSelect(month)}
            className="nopy-focus relative"
            style={vertical ? tabVertical(active, empty) : tabHorizontal(active, empty)}
            onMouseEnter={(e) => {
              if (vertical && !empty && !active) {
                e.currentTarget.style.background = 'var(--parchment)'
                e.currentTarget.style.color = 'var(--ink)'
              }
            }}
            onMouseLeave={(e) => {
              if (vertical && !empty && !active) {
                e.currentTarget.style.background = 'var(--warm-cream)'
                e.currentTarget.style.color = 'var(--manuscript)'
              }
            }}
          >
            <span>{name}</span>
            {vertical && !empty && (
              <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'var(--sage)', lineHeight: 1 }}>
                {count}
              </span>
            )}
            {today === month && (
              <span
                aria-hidden
                style={{ position: 'absolute', top: 5, right: 5, width: 4, height: 4, borderRadius: '50%', background: 'var(--amber)' }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

function tabVertical(active: boolean, empty: boolean): React.CSSProperties {
  return {
    // -1 overlaps the rail's rule so the tab visually hangs off the page edge.
    width: 48, height: 38, marginLeft: -1, padding: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
    fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
    border: '1px solid var(--stone)', borderLeft: 'none',
    borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
    background: active ? 'var(--parchment)' : empty ? 'transparent' : 'var(--warm-cream)',
    color: active ? 'var(--ink)' : empty ? 'var(--sage)' : 'var(--manuscript)',
    boxShadow: active ? 'inset -3px 0 0 var(--forest)' : 'none',
    opacity: empty ? 0.45 : 1,
    cursor: empty ? 'default' : 'pointer',
    transition: 'background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast)',
  }
}

function tabHorizontal(active: boolean, empty: boolean): React.CSSProperties {
  // Mirrors MoodTimeline's pill tabs so the two tab bars agree.
  return {
    fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, padding: '4px 12px',
    borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap', flexShrink: 0,
    border: `1px solid ${active ? 'var(--forest)' : 'var(--stone)'}`,
    background: active ? 'var(--forest)' : 'transparent',
    color: active ? 'white' : empty ? 'var(--sage)' : 'var(--ink)',
    opacity: empty ? 0.45 : 1, cursor: empty ? 'default' : 'pointer', userSelect: 'none',
    transition: 'all var(--transition-fast)',
  }
}

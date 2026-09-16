import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { BookOpen, Plus } from 'lucide-react'
import { EntryCard } from '../EntryCard'
import { EmptyState } from '../../ui/EmptyState'
import { Button } from '../../ui/Button'
import { MONTH_PANEL_ID } from './MonthTabs'
import { useJournalNavStore } from '../../../stores/journalNavStore'
import { useJournalStore } from '../../../stores/journalStore'
import { sameMonth, type MonthRef } from '../../../services/journalBooks'
import { getGreeting } from '../../../utils/greeting'
import type { JournalEntry } from '../../../types/journal'

const HIGHLIGHT_MS = 1600

interface MonthScrollProps {
  month: MonthRef
  /** Newest first. */
  entries: JournalEntry[]
  isCurrentMonth: boolean
  journalEmpty: boolean
  onNewEntry: () => void
}

/**
 * One month's page of entries. Owns the scroll container so it can put the
 * reader back where they were: the parent keys this component by month, so
 * every mount makes a fresh restore decision.
 *
 * - Coming back from an entry (revealEntryId set): scroll that card into
 *   view and pulse it, without the staggered entrance.
 * - Returning to the same month by other means: restore the last scrollTop.
 * - Otherwise: start at the top with the entrance animation.
 */
export function MonthScroll({ month: monthProp, entries, isCurrentMonth, journalEmpty, onNewEntry }: MonthScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // The parent builds a fresh MonthRef each render; keep one identity per month.
  const month = useMemo(() => ({ year: monthProp.year, month: monthProp.month }), [monthProp.year, monthProp.month])
  const loaded = useJournalStore((s) => s.loaded)
  // Decided once at mount so a parent re-render can never restart the
  // entrance or re-apply a restore. Opening a different book gets the slow
  // content handoff; switching a tab inside the same book is a gentle arrival.
  const [restore] = useState(() => {
    const nav = useJournalNavStore.getState()
    return {
      revealId: nav.revealEntryId,
      scrollTop: sameMonth(nav.lastMonth, month) ? nav.scrollTop : 0,
      arrival: nav.lastMonth?.year === month.year ? 'gentle' : 'slow',
    }
  })
  const arrival = restore.arrival
  const restoring = restore.revealId !== null || restore.scrollTop > 0
  const [highlightId, setHighlightId] = useState<string | null>(null)

  // Jump before paint so there is no flash at the top.
  useLayoutEffect(() => {
    if (!loaded) return
    const el = containerRef.current
    if (!el) return
    const nav = useJournalNavStore.getState()
    if (restore.revealId) {
      const card = el.querySelector<HTMLElement>(`[data-entry-id="${restore.revealId}"]`)
      if (card) {
        card.scrollIntoView({ block: 'center' })
        setHighlightId(restore.revealId)
      }
      // Consume it so a later tab switch does not re-reveal.
      nav.setRevealEntry(null)
    } else if (restore.scrollTop > 0) {
      el.scrollTop = restore.scrollTop
    }
    nav.rememberScroll(month, el.scrollTop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [highlightId])

  // Save position: rAF-throttled while scrolling, and a final write on unmount.
  const rafRef = useRef<number | null>(null)
  const handleScroll = () => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = containerRef.current
      if (el) useJournalNavStore.getState().rememberScroll(month, el.scrollTop)
    })
  }
  useEffect(() => {
    // Capture now: the ref is detached by the time cleanup runs.
    const el = containerRef.current
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (el) useJournalNavStore.getState().rememberScroll(month, el.scrollTop)
    }
  }, [month])

  const first = new Date(month.year, month.month - 1, 1)
  const count = entries.length

  return (
    <div
      ref={containerRef}
      id={MONTH_PANEL_ID}
      role="tabpanel"
      aria-labelledby={`month-tab-${month.month}`}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
      style={{ padding: '36px 44px' }}
    >
      <div style={{ animation: restoring ? 'none' : `${arrival === 'slow' ? 'cardIn' : 'appIn'} var(--transition-${arrival})` }}>
        {isCurrentMonth && (
          <>
            <div style={{ fontFamily: 'var(--font-agent)', fontSize: 18, fontWeight: 400, color: 'var(--bark)', marginBottom: 8, lineHeight: 1.5 }}>
              {getGreeting()}. How are you arriving today?
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)', marginBottom: 28 }}>
              {format(new Date(), 'EEEE, d MMMM yyyy')}
            </div>
          </>
        )}

        <div className="flex items-baseline" style={{ gap: 10, marginBottom: 22 }}>
          <h1 style={{ fontFamily: 'var(--font-title)', fontSize: 26, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', lineHeight: 1.2, margin: 0 }}>
            {format(first, 'MMMM yyyy')}
          </h1>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)' }}>
            · {count} {count === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {journalEmpty ? (
          <EmptyState
            icon={<BookOpen size={48} strokeWidth={1.2} />}
            title="Your journal awaits"
            description="Start your first entry to begin building a record of your inner world."
            action={
              <Button onClick={onNewEntry}>
                <Plus size={14} strokeWidth={2} />
                Write your first entry
              </Button>
            }
          />
        ) : count === 0 ? (
          <EmptyState
            icon={<BookOpen size={48} strokeWidth={1.2} />}
            title={`Nothing written in ${format(first, 'MMMM')}`}
            description="Choose another month from the index, or begin an entry."
            action={
              <Button onClick={onNewEntry}>
                <Plus size={14} strokeWidth={2} />
                New Entry
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3.5">
            {entries.map((entry, i) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                index={i}
                animate={!restoring}
                highlighted={entry.id === highlightId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

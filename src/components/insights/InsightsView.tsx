import { useEffect, useMemo, useRef } from 'react'
import { MainHeader } from '../ui/MainHeader'
import { EmptyState } from '../ui/EmptyState'
import { ProfileSection } from '../ui/ProfileSection'
import { RangePicker } from './RangePicker'
import {
  MetricCards, MoodDistribution, MoodTimeline, StatesChart, EmotionsHeatmap, SleepChart, BodyChart, DomainsChart, SafetyTable, CoverageHint,
} from './InsightsSections'
import { useJournalStore } from '../../stores/journalStore'
import { useRememberedState, useRememberedScroll } from '../../hooks/usePageMemory'
import { bucketEntries, windowSummary, safetyRows } from '../../services/insightSeries'
import { computeJournalingStreak } from '../../services/entryProcessor'
import { getWindow, granularityFor, windowLabel, type Range } from '../../utils/timeSeries'
import { BarChart3 } from 'lucide-react'

/**
 * Time-based views computed locally from each entry's structured index
 * record. One range picker drives every card and chart so sleep, states
 * and mood can be read against each other for the same period.
 */
export function InsightsView() {
  const entries = useJournalStore((s) => s.entries)
  const loaded = useJournalStore((s) => s.loaded)
  const loadEntries = useJournalStore((s) => s.loadEntries)
  // Remembered per history entry, so coming Back from an entry finds the
  // same period; a fresh visit from the rail starts on this month.
  const [range, setRange] = useRememberedState<Range>('range', 'month')
  const [offset, setOffset] = useRememberedState('offset', 0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { onScroll } = useRememberedScroll(scrollRef, loaded)

  useEffect(() => {
    if (!loaded) loadEntries()
  }, [loaded, loadEntries])

  const earliest = useMemo(() => {
    if (entries.length === 0) return undefined
    return new Date(Math.min(...entries.map((e) => new Date(e.createdAt).getTime())))
  }, [entries])
  const window = useMemo(() => getWindow(range, offset, { earliest }), [range, offset, earliest])
  const buckets = useMemo(() => bucketEntries(entries, window, granularityFor(range)), [entries, window, range])
  const summary = useMemo(() => windowSummary(entries, window), [entries, window])
  const safety = useMemo(() => safetyRows(entries, window), [entries, window])
  const streak = useMemo(() => computeJournalingStreak(entries), [entries])
  const chartProps = { buckets, window, range }

  return (
    <>
      <MainHeader title="Insights">
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--sage)' }}>
          {summary.entryCount} {summary.entryCount === 1 ? 'entry' : 'entries'} in this period
        </span>
      </MainHeader>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto" style={{ padding: '36px 44px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
          {loaded && entries.length === 0 ? (
            <EmptyState
              icon={<BarChart3 size={48} strokeWidth={1.2} />}
              title="No entries yet"
              description="Insights are computed from your indexed entries as you write."
            />
          ) : (
            <>
              <div style={{ marginBottom: 24 }}>
                <RangePicker
                  range={range}
                  offset={offset}
                  label={windowLabel(range, window)}
                  onRangeChange={setRange}
                  onOffsetChange={setOffset}
                />
              </div>

              <CoverageHint summary={summary} />

              <ProfileSection title="Wellbeing">
                <MetricCards summary={summary} streak={streak} />
                <div style={{ marginTop: 20 }}>
                  <MoodDistribution summary={summary} />
                </div>
              </ProfileSection>

              <ProfileSection title="Mood over time">
                <MoodTimeline {...chartProps} />
              </ProfileSection>

              <ProfileSection title="Inferred states">
                <StatesChart {...chartProps} />
              </ProfileSection>

              <ProfileSection title="Emotions">
                <EmotionsHeatmap {...chartProps} />
              </ProfileSection>

              <ProfileSection title="Sleep">
                <SleepChart {...chartProps} />
              </ProfileSection>

              <ProfileSection title="Body">
                <BodyChart {...chartProps} />
              </ProfileSection>

              <ProfileSection title="Domains">
                <DomainsChart {...chartProps} />
              </ProfileSection>

              {safety.length > 0 && (
                <ProfileSection title="Safety flags">
                  <SafetyTable rows={safety} />
                </ProfileSection>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

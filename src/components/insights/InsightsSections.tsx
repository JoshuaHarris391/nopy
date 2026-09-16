import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { MetricCard } from '../ui/MetricCard'
import { TimeSeriesChart, type Series } from './charts/TimeSeriesChart'
import { StackedBarChart } from './charts/StackedBarChart'
import { HeatmapChart } from './charts/HeatmapChart'
import {
  moodSeries, allStateSeries, emotionSeries, bodySeries, domainSeries, STATE_LABELS,
  type Bucket, type WindowSummary, type SafetyRow,
} from '../../services/insightSeries'
import { STATE_KEYS } from '../../schemas/journal'
import { STATE_COLORS, assignColors } from '../../utils/chartColors'
import { windowLabel, type Range, type TimeWindow } from '../../utils/timeSeries'

interface ChartProps { buckets: Bucket[]; window: TimeWindow; range: Range }

export function MetricCards({ summary, streak }: { summary: WindowSummary; streak: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      <MetricCard
        testId="metric-mood"
        label="Average mood"
        value={summary.averageMood != null ? summary.averageMood.toFixed(1) : '--'}
        trend={summary.writerRatedCount > 0 ? `${summary.writerRatedCount} writer-rated ${summary.writerRatedCount === 1 ? 'entry' : 'entries'}` : 'no writer ratings'}
      />
      <MetricCard testId="metric-streak" label="Current streak" value={`${streak}d`} />
      <MetricCard testId="metric-length" label="Avg entry length" value={summary.avgEntryLength != null ? `${summary.avgEntryLength}w` : '--'} />
      <MetricCard testId="metric-depth" label="Reflection depth" value={summary.reflectionDepth ?? '--'} />
    </div>
  )
}

export function MoodDistribution({ summary }: { summary: WindowSummary }) {
  if (summary.distribution.length === 0) return null
  return (
    <div className="flex flex-col gap-2" data-testid="mood-distribution">
      {summary.distribution.map((item) => (
        <div key={item.label} className="flex items-center gap-3" style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5 }}>
          <span style={{ width: 90, color: 'var(--manuscript)', flexShrink: 0, textTransform: 'capitalize' }}>{item.label}</span>
          <div style={{ flex: 1, height: 8, background: 'var(--warm-cream)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${item.percentage}%`, height: '100%', background: item.color, borderRadius: 4, transition: 'width 0.4s ease' }} />
          </div>
          <span style={{ width: 36, textAlign: 'right', color: 'var(--sage)', fontSize: 13.5 }}>{item.percentage}%</span>
        </div>
      ))}
    </div>
  )
}

export function MoodTimeline({ buckets, window, range }: ChartProps) {
  const data = useMemo(() => moodSeries(buckets), [buckets])
  const writer = data.points.filter((p) => p.source === 'writer')
  const inferred = data.points.filter((p) => p.source === 'inferred')
  const series: Series[] = [
    { id: 'writer', label: 'Writer-rated', color: 'var(--forest)', points: writer, line: data.means, pointColor: (p) => (p as typeof writer[number]).color },
    { id: 'inferred', label: 'Inferred by the index', color: 'var(--sage)', points: inferred, pointShape: 'hollow', pointColor: (p) => (p as typeof inferred[number]).color },
  ]
  const avg = data.points.length ? (data.points.reduce((s, p) => s + p.value, 0) / data.points.length).toFixed(1) : '–'
  return (
    <TimeSeriesChart
      id="mood"
      window={window}
      range={range}
      domain={[1, 10]}
      yTicks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
      series={series}
      trend
      formatTooltip={(p) => `${format(new Date(p.t), 'MMM d')} · ${p.value}/10${p.n != null ? ` mean (n ${p.n})` : p.label ? ` · ${p.label}` : ''}`}
      ariaLabel={`Mood over time, ${data.points.length} entries, ${windowLabel(range, window)}, average ${avg}`}
    />
  )
}

export function StatesChart({ buckets, window, range }: ChartProps) {
  const all = useMemo(() => allStateSeries(buckets), [buckets])
  const series: Series[] = STATE_KEYS.map((k) => ({ id: k, label: STATE_LABELS[k], color: STATE_COLORS[k], points: [], line: all[k].means }))
  const withData = series.filter((s) => (s.line?.length ?? 0) > 0).length
  return (
    <TimeSeriesChart
      id="states"
      window={window}
      range={range}
      domain={[0, 10]}
      series={series}
      minPoints={2}
      formatTooltip={(p, s) => `${s.label} · ${p.value} (n ${p.n ?? 0})`}
      ariaLabel={`Inferred states over time, ${withData} of 7 states with confident data, ${windowLabel(range, window)}`}
    />
  )
}

export function EmotionsHeatmap({ buckets, window, range }: ChartProps) {
  const data = useMemo(() => emotionSeries(buckets), [buckets])
  return (
    <HeatmapChart
      id="emotions"
      data={data}
      ariaLabel={`Emotions over time, ${data.categories.length} labels across ${data.buckets.length} periods, ${windowLabel(range, window)}`}
    />
  )
}

const BODY_LABELS: Record<string, string> = { other_recreational: 'other substance', chest_tightness: 'chest tightness', heart_racing: 'heart racing', muscle_tension: 'muscle tension', appetite_change: 'appetite change', pain_other: 'other pain' }

export function SleepChart({ buckets, window, range }: ChartProps) {
  const data = useMemo(() => bodySeries(buckets), [buckets])
  return (
    <TimeSeriesChart
      id="sleep"
      window={window}
      range={range}
      domain={[0, 12]}
      yTicks={[0, 4, 8, 12]}
      height={170}
      series={[{ id: 'sleep', label: 'Sleep hours', color: 'var(--chart-1)', points: data.sleep, line: data.sleepMeans }]}
      legend={false}
      formatTooltip={(p) => `${format(new Date(p.t), 'MMM d')} · ${p.value}h${p.n != null ? ` mean (n ${p.n})` : ''}`}
      emptyText="No sleep hours recorded in this period"
      ariaLabel={`Sleep hours, ${data.sleep.length} entries with sleep recorded, ${windowLabel(range, window)}`}
    />
  )
}

export function BodyChart({ buckets, window, range }: ChartProps) {
  const data = useMemo(() => bodySeries(buckets), [buckets])
  const colors = useMemo(() => assignColors(data.events.categories), [data.events.categories])
  return (
    <StackedBarChart
      id="body-events"
      data={data.events}
      mode="count"
      colors={colors}
      labels={BODY_LABELS}
      height={220}
      emptyText="No substances or symptoms recorded in this period"
      ariaLabel={`Substances and symptoms per period, ${data.events.categories.length} kinds, ${windowLabel(range, window)}`}
    />
  )
}

export function DomainsChart({ buckets, window, range }: ChartProps) {
  const data = useMemo(() => domainSeries(buckets), [buckets])
  const colors = useMemo(() => assignColors(data.categories), [data.categories])
  return (
    <StackedBarChart
      id="domains"
      data={data}
      mode="percent"
      colors={colors}
      ariaLabel={`Domains mix per period, ${data.categories.length} domains, ${windowLabel(range, window)}`}
    />
  )
}

const FLAG_STYLE: Record<'monitor' | 'concern', React.CSSProperties> = {
  monitor: { background: 'rgba(212, 160, 60, 0.18)', color: '#8a5a12', border: '1px solid rgba(212, 160, 60, 0.5)' },
  concern: { background: 'rgba(196, 72, 60, 0.16)', color: '#8f2a20', border: '1px solid rgba(196, 72, 60, 0.5)' },
}

export function SafetyTable({ rows }: { rows: SafetyRow[] }) {
  if (rows.length === 0) return null
  return (
    <table data-testid="safety-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-ui)', fontSize: 13.5 }}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.entryId} style={{ borderTop: '1px solid rgba(212, 201, 184, 0.35)' }}>
            <td style={{ padding: '8px 6px 8px 0', color: 'var(--sage)', whiteSpace: 'nowrap' }}>{r.date}</td>
            <td style={{ padding: '8px 6px' }}>
              <span style={{ ...FLAG_STYLE[r.flag], fontSize: 11, padding: '1px 7px', borderRadius: 10 }}>{r.flag}</span>
            </td>
            <td style={{ padding: '8px 6px', color: 'var(--manuscript)' }}>
              <Link to={`/journal/${r.entryId}`} style={{ color: 'var(--ink)', fontWeight: 500 }}>{r.title}</Link>
              {r.evidence && <span style={{ color: 'var(--sage)' }}> — "{r.evidence}"</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Explains gaps in the index-based charts, and sends the reader to the right
 * fix: never-indexed entries need Update Index on the Index page; indexed
 * entries with an older or missing record need Re-index in Settings.
 */
export function CoverageHint({ summary }: { summary: WindowSummary }) {
  const { unindexedCount, staleCount, entryCount } = summary
  if (unindexedCount + staleCount <= 0) return null
  const n = (k: number) => `${k} ${k === 1 ? 'entry' : 'entries'}`
  return (
    <div
      data-testid="coverage-hint"
      style={{
        fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--sage)', marginBottom: 20,
        padding: '8px 12px', background: 'var(--warm-cream)', border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
      }}
    >
      State, emotion, body and domain charts only cover indexed entries.{' '}
      {unindexedCount > 0 && (
        <span data-testid="coverage-unindexed">
          {n(unindexedCount)} of {entryCount} in this period {unindexedCount === 1 ? 'is' : 'are'} not yet indexed:{' '}
          <Link to="/index" style={{ color: 'var(--bark)', textDecoration: 'underline' }}>Update Index</Link>.{' '}
        </span>
      )}
      {staleCount > 0 && (
        <span data-testid="coverage-stale">
          {n(staleCount)} {staleCount === 1 ? 'was' : 'were'} indexed with an older or incomplete record:{' '}
          <Link to="/settings" style={{ color: 'var(--bark)', textDecoration: 'underline' }}>Re-index in Settings</Link>.
        </span>
      )}
    </div>
  )
}

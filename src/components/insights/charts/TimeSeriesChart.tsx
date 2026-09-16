import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChartFrame } from './ChartFrame'
import { ChartTooltip } from './ChartTooltip'
import { ChartLegend } from './ChartLegend'
import type { SeriesPoint } from '../../../services/insightSeries'
import { fracOf, getXTicks, trendLine, type Range, type TimeWindow } from '../../../utils/timeSeries'

export interface Series {
  id: string
  label: string
  color: string
  /** Rendered as markers. */
  points: SeriesPoint[]
  /** Optional connecting line (typically bucket means). */
  line?: SeriesPoint[]
  pointShape?: 'filled' | 'hollow'
  /** Per-point colour override (the mood chart colours dots by mood label). */
  pointColor?: (p: SeriesPoint) => string
}

export interface TimeSeriesChartProps {
  id: string
  window: TimeWindow
  range: Range
  domain: [number, number]
  series: Series[]
  /** Least-squares line over every visible marker. */
  trend?: boolean
  legend?: boolean
  defaultHidden?: string[]
  /** Fewer visible markers than this across all series → empty state. */
  minPoints?: number
  emptyText?: string
  yTicks?: number[]
  height?: number
  formatTooltip?: (p: SeriesPoint, s: Series) => string
  ariaLabel: string
}

const defaultTooltip = (p: SeriesPoint) => `${format(new Date(p.t), 'MMM d')} · ${p.value}${p.n != null ? ` (n ${p.n})` : ''}`

/**
 * Multi-series line + marker chart over one time window. Hover state is
 * local; markers get an invisible hit circle larger than the mark. Text
 * wears text tokens; only marks carry the series colour.
 */
export function TimeSeriesChart({
  id, window, range, domain, series, trend, legend = true, defaultHidden = [],
  minPoints = 2, emptyText = 'Not enough indexed entries in this period', yTicks, height, formatTooltip, ariaLabel,
}: TimeSeriesChartProps) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(defaultHidden))
  const [hovered, setHovered] = useState<{ series: string; index: number } | null>(null)
  const visible = useMemo(() => series.filter((s) => !hidden.has(s.id)), [series, hidden])
  const visibleMarkers = visible.reduce((n, s) => n + s.points.length + (s.points.length === 0 ? (s.line?.length ?? 0) : 0), 0)
  const xTicks = useMemo(() => getXTicks(range, window), [range, window])
  const toggle = (sid: string) => setHidden((prev) => {
    const next = new Set(prev)
    if (next.has(sid)) next.delete(sid); else next.add(sid)
    return next
  })

  return (
    <div>
      {legend && series.length > 1 && (
        <ChartLegend
          items={series.map((s) => ({ id: s.id, label: s.label, color: s.color, shape: s.pointShape === 'hollow' ? 'hollow' : 'filled' }))}
          hidden={hidden}
          onToggle={toggle}
        />
      )}
      <ChartFrame id={id} domain={domain} yTicks={yTicks} xTicks={xTicks} ariaLabel={ariaLabel} height={height} empty={visibleMarkers < minPoints ? emptyText : null}>
        {(sc) => {
          const px = (p: SeriesPoint) => sc.xFrac(fracOf(p.t, window))
          const py = (p: SeriesPoint) => sc.y(p.value)
          const allMarks = visible.flatMap((s) => (s.points.length ? s.points : s.line ?? []).map((p) => ({ x: px(p), y: py(p) })))
          const tl = trend ? trendLine(allMarks.sort((a, b) => a.x - b.x)) : null
          return (
            <>
              {tl && (
                <line data-trend x1={tl.x1} y1={tl.y1} x2={tl.x2} y2={tl.y2} stroke="var(--stone)" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="4 3" />
              )}
              {visible.map((s) => {
                const markers = s.points.length ? s.points : (s.line ?? [])
                const linePts = s.line ?? []
                if (markers.length === 0 && linePts.length === 0) return null
                const d = linePts.length >= 2 ? linePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p).toFixed(1)},${py(p).toFixed(1)}`).join(' ') : null
                return (
                  <g key={s.id} data-series={s.id}>
                    {d && <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                    {markers.map((p, i) => {
                      const cx = px(p)
                      const cy = py(p)
                      const isHovered = hovered?.series === s.id && hovered.index === i
                      const color = s.pointColor ? s.pointColor(p) : s.color
                      const hollow = s.pointShape === 'hollow'
                      return (
                        <g key={p.entryId ?? p.bucketKey ?? i}>
                          <circle
                            data-hit
                            cx={cx} cy={cy} r={14} fill="transparent" style={{ cursor: 'pointer' }}
                            onMouseEnter={() => setHovered({ series: s.id, index: i })}
                            onMouseLeave={() => setHovered(null)}
                          />
                          <circle
                            data-point data-t={p.t} data-value={p.value} data-entry={p.entryId}
                            cx={cx} cy={cy} r={isHovered ? 6 : 4}
                            fill={hollow ? 'var(--parchment)' : color}
                            stroke={hollow ? color : 'var(--parchment)'}
                            strokeWidth={2}
                            style={{ pointerEvents: 'none', transition: 'r 0.15s ease' }}
                          >
                            <title>{(formatTooltip ?? defaultTooltip)(p, s)}</title>
                          </circle>
                        </g>
                      )
                    })}
                  </g>
                )
              })}
              {hovered && (() => {
                const s = visible.find((x) => x.id === hovered.series)
                const p = s ? (s.points.length ? s.points : s.line ?? [])[hovered.index] : undefined
                return s && p ? <ChartTooltip x={px(p)} y={py(p)} text={(formatTooltip ?? defaultTooltip)(p, s)} plotLeft={sc.plot.left} plotRight={sc.plot.right} /> : null
              })()}
            </>
          )
        }}
      </ChartFrame>
    </div>
  )
}

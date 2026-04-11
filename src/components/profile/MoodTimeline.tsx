import { useState, useMemo } from 'react'
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  addWeeks, addMonths, addYears, eachDayOfInterval, eachMonthOfInterval,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { JournalEntry } from '../../types/journal'
import { getMoodColor, moodLabelColors } from '../../utils/mood'
import type { MoodLabel } from '../../types/journal'

function colorForMood(value: number, label?: string): string {
  if (label && moodLabelColors[label as MoodLabel]) return moodLabelColors[label as MoodLabel]
  return getMoodColor(value)
}

interface MoodPoint {
  date: Date
  value: number
  color: string
  title: string
}

export type Range = 'week' | 'month' | 'year'

const PAD = { top: 20, right: 20, bottom: 32, left: 42 }
const W = 680
const H = 260
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top - PAD.bottom

// eslint-disable-next-line react-refresh/only-export-components
export function getWindow(range: Range, offset: number): { start: Date; end: Date } {
  const now = new Date()
  if (range === 'week') {
    const base = addWeeks(now, offset)
    return { start: startOfWeek(base, { weekStartsOn: 1 }), end: endOfWeek(base, { weekStartsOn: 1 }) }
  }
  if (range === 'month') {
    const base = addMonths(now, offset)
    return { start: startOfMonth(base), end: endOfMonth(base) }
  }
  const base = addYears(now, offset)
  return { start: startOfYear(base), end: endOfYear(base) }
}

function getXTicks(range: Range, start: Date, end: Date): { label: string; frac: number }[] {
  const total = end.getTime() - start.getTime() || 1
  if (range === 'week') {
    return eachDayOfInterval({ start, end }).map((d) => ({
      label: format(d, 'EEE'),
      frac: (d.getTime() - start.getTime()) / total,
    }))
  }
  if (range === 'month') {
    const days = eachDayOfInterval({ start, end })
    const step = Math.max(1, Math.floor(days.length / 5))
    const ticks: { label: string; frac: number }[] = []
    for (let i = 0; i < days.length; i += step) {
      ticks.push({ label: format(days[i], 'MMM d'), frac: (days[i].getTime() - start.getTime()) / total })
    }
    const last = days[days.length - 1]
    if (ticks[ticks.length - 1].frac < 0.95) {
      ticks.push({ label: format(last, 'MMM d'), frac: 1 })
    }
    return ticks
  }
  return eachMonthOfInterval({ start, end }).map((d) => ({
    label: format(d, 'MMM'),
    frac: (d.getTime() - start.getTime()) / total,
  }))
}

function windowLabel(range: Range, start: Date, end: Date): string {
  if (range === 'week') return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
  if (range === 'month') return format(start, 'MMMM yyyy')
  return format(start, 'yyyy')
}

/** Linear regression trend line across all points, returns [x1,y1,x2,y2] */
function trendLine(pts: { x: number; y: number }[]): { x1: number; y1: number; x2: number; y2: number } | null {
  if (pts.length < 2) return null
  const n = pts.length
  const sumX = pts.reduce((s, p) => s + p.x, 0)
  const sumY = pts.reduce((s, p) => s + p.y, 0)
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0)
  const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return null
  const m = (n * sumXY - sumX * sumY) / denom
  const b = (sumY - m * sumX) / n
  const x1 = pts[0].x
  const x2 = pts[pts.length - 1].x
  return { x1, y1: m * x1 + b, x2, y2: m * x2 + b }
}

const TAB_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 12,
  fontWeight: 500,
  padding: '4px 12px',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  border: '1px solid var(--stone)',
  background: 'transparent',
  color: 'var(--ink)',
  transition: 'all var(--transition-gentle)',
  userSelect: 'none',
}

const TAB_ACTIVE: React.CSSProperties = {
  ...TAB_STYLE,
  background: 'var(--forest)',
  color: 'white',
  border: '1px solid var(--forest)',
}

const NAV_BTN: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--stone)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  padding: '4px 6px',
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--ink)',
  transition: 'all var(--transition-gentle)',
}

interface MoodTimelineProps {
  entries: JournalEntry[]
  range: Range
  offset: number
  onRangeChange: (r: Range) => void
  onOffsetChange: (o: number) => void
}

export function MoodTimeline({ entries, range, offset, onRangeChange, onOffsetChange }: MoodTimelineProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  const allPoints = useMemo<MoodPoint[]>(() => {
    return entries
      .filter((e) => e.mood && e.mood.value != null)
      .map((e) => ({
        date: new Date(e.createdAt),
        value: e.mood!.value,
        color: colorForMood(e.mood!.value, e.mood!.label),
        title: e.title,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [entries])

  const { start: winStart, end: winEnd } = useMemo(() => getWindow(range, offset), [range, offset])

  const points = useMemo(() => {
    const s = winStart.getTime()
    const e = winEnd.getTime()
    return allPoints.filter((p) => p.date.getTime() >= s && p.date.getTime() <= e)
  }, [allPoints, winStart, winEnd])

  if (allPoints.length < 2) return null

  const winStartT = winStart.getTime()
  const winEndT = winEnd.getTime()
  const winRange = winEndT - winStartT || 1

  const px = (p: MoodPoint) => PAD.left + ((p.date.getTime() - winStartT) / winRange) * CW
  const py = (p: MoodPoint) => PAD.top + CH - ((p.value - 1) / 9) * CH

  const yTicks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const xTicks = getXTicks(range, winStart, winEnd)

  const trend = points.length >= 2 ? trendLine(points.map((p) => ({ x: px(p), y: py(p) }))) : null

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{
        fontFamily: 'var(--font-ui)', fontSize: 13, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--sage)', fontWeight: 600, marginBottom: 12,
      }}>
        Mood Over Time
      </div>

      {/* Tab bar + navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['week', 'month', 'year'] as Range[]).map((r) => (
            <button key={r} style={range === r ? TAB_ACTIVE : TAB_STYLE} onClick={() => { onRangeChange(r); onOffsetChange(0) }}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={NAV_BTN} onClick={() => onOffsetChange(offset - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--manuscript)', minWidth: 130, textAlign: 'center' }}>
            {windowLabel(range, winStart, winEnd)}
          </span>
          <button style={NAV_BTN} onClick={() => onOffsetChange(Math.min(0, offset + 1))}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* Y grid + labels */}
        {yTicks.map((tick) => {
          const ty = PAD.top + CH - ((tick - 1) / 9) * CH
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={ty} x2={W - PAD.right} y2={ty} stroke="var(--stone)" strokeWidth={0.5} />
              <text x={PAD.left - 8} y={ty + 4} textAnchor="end" fill="var(--sage)" fontSize={10} fontFamily="var(--font-ui)">{tick}</text>
            </g>
          )
        })}

        {/* X labels */}
        {xTicks.map((t, i) => (
          <text key={i} x={PAD.left + t.frac * CW} y={H - 4} textAnchor="middle" fill="var(--sage)" fontSize={10} fontFamily="var(--font-ui)">{t.label}</text>
        ))}

        {/* Trend line */}
        {trend && (
          <line x1={trend.x1} y1={trend.y1} x2={trend.x2} y2={trend.y2} stroke="var(--stone)" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="4 3" />
        )}

        {/* Points */}
        {points.map((p, i) => {
          const cx = px(p)
          const cy = py(p)
          const isHovered = hovered === i
          const tooltipX = Math.max(PAD.left + 60, Math.min(W - PAD.right - 60, cx))
          return (
            <g key={i}>
              <circle
                cx={cx} cy={cy} r={16}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
              <circle
                cx={cx} cy={cy}
                r={isHovered ? 7 : 4.5}
                fill={p.color}
                stroke="white"
                strokeWidth={isHovered ? 2.5 : 1.5}
                style={{ transition: 'r 0.15s ease, stroke-width 0.15s ease', pointerEvents: 'none' }}
              />
              {isHovered && (
                <g>
                  <rect x={tooltipX - 60} y={cy - 46} width={120} height={32} rx={6} fill="var(--ink)" opacity={0.88} />
                  <text x={tooltipX} y={cy - 25} textAnchor="middle" fill="white" fontSize={11.5} fontFamily="var(--font-ui)" fontWeight={500}>
                    {format(p.date, 'MMM d')} · {p.value}/10
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {/* Empty state */}
        {points.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--sage)" fontSize={13} fontFamily="var(--font-ui)">
            No mood data for this period
          </text>
        )}
      </svg>
    </div>
  )
}

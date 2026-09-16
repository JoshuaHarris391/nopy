import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  addWeeks, addMonths, addYears, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval,
  endOfDay, min as minDate, max as maxDate,
} from 'date-fns'

/**
 * Date-only helpers behind every time-based chart: the visible window for a
 * range + offset, the dense bucket grid inside it, axis ticks, and the
 * least-squares trend line. Nothing here knows about journal entries, and
 * every function that needs "now" takes it as an argument so tests are
 * deterministic.
 */

export type Range = 'week' | 'month' | 'year' | 'all'
export const RANGES: Range[] = ['week', 'month', 'year', 'all']
export type Granularity = 'day' | 'week' | 'month'

export interface TimeWindow { start: Date; end: Date }
export interface BucketBounds {
  /** 'yyyy-MM-dd' for day/week buckets (the bucket's first day), 'yyyy-MM' for months. */
  key: string
  label: string
  start: Date
  end: Date
}

const WEEK = { weekStartsOn: 1 as const }

export function getWindow(range: Range, offset: number, opts: { now?: Date; earliest?: Date } = {}): TimeWindow {
  const now = opts.now ?? new Date()
  if (range === 'week') {
    const base = addWeeks(now, offset)
    return { start: startOfWeek(base, WEEK), end: endOfWeek(base, WEEK) }
  }
  if (range === 'month') {
    const base = addMonths(now, offset)
    return { start: startOfMonth(base), end: endOfMonth(base) }
  }
  if (range === 'year') {
    const base = addYears(now, offset)
    return { start: startOfYear(base), end: endOfYear(base) }
  }
  // 'all': offset is meaningless; span the first entry's month to this month.
  const earliest = opts.earliest && opts.earliest.getTime() < now.getTime() ? opts.earliest : now
  return { start: startOfMonth(earliest), end: endOfMonth(now) }
}

/**
 * One granularity per range. Month buckets by week rather than day: a
 * 31-column stacked chart with 0-1 entries per column is a list, not an
 * aggregate. Line charts still plot every entry as a point.
 */
export function granularityFor(range: Range): Granularity {
  if (range === 'week') return 'day'
  if (range === 'month') return 'week'
  return 'month'
}

/** Dense, contiguous bucket bounds clipped to the window. */
export function bucketBounds(window: TimeWindow, granularity: Granularity): BucketBounds[] {
  if (granularity === 'day') {
    return eachDayOfInterval(window).map((d) => ({
      key: format(d, 'yyyy-MM-dd'),
      label: format(d, 'EEE d'),
      start: d,
      end: minDate([endOfDay(d), window.end]),
    }))
  }
  if (granularity === 'week') {
    return eachWeekOfInterval(window, WEEK).map((w) => {
      const start = maxDate([startOfWeek(w, WEEK), window.start])
      const end = minDate([endOfWeek(w, WEEK), window.end])
      return { key: format(start, 'yyyy-MM-dd'), label: `${format(start, 'd MMM')}`, start, end }
    })
  }
  return eachMonthOfInterval(window).map((m) => {
    const start = maxDate([startOfMonth(m), window.start])
    const end = minDate([endOfMonth(m), window.end])
    return { key: format(m, 'yyyy-MM'), label: format(m, 'MMM'), start, end }
  })
}

/** Fraction (0..1) of the window at time `t`, clamped. */
export function fracOf(t: number, window: TimeWindow): number {
  const total = window.end.getTime() - window.start.getTime() || 1
  return Math.min(1, Math.max(0, (t - window.start.getTime()) / total))
}

export function getXTicks(range: Range, window: TimeWindow): Array<{ label: string; frac: number }> {
  const { start, end } = window
  if (range === 'week') {
    return eachDayOfInterval({ start, end }).map((d) => ({ label: format(d, 'EEE'), frac: fracOf(d.getTime(), window) }))
  }
  if (range === 'month') {
    const days = eachDayOfInterval({ start, end })
    const step = Math.max(1, Math.floor(days.length / 5))
    const ticks: Array<{ label: string; frac: number }> = []
    for (let i = 0; i < days.length; i += step) {
      ticks.push({ label: format(days[i], 'MMM d'), frac: fracOf(days[i].getTime(), window) })
    }
    const last = days[days.length - 1]
    if (ticks[ticks.length - 1].frac < 0.95) ticks.push({ label: format(last, 'MMM d'), frac: 1 })
    return ticks
  }
  const months = eachMonthOfInterval({ start, end })
  if (range === 'year') {
    return months.map((d) => ({ label: format(d, 'MMM'), frac: fracOf(d.getTime(), window) }))
  }
  // 'all': thin to at most 8 labelled months so labels never collide.
  const step = Math.max(1, Math.ceil(months.length / 8))
  return months
    .filter((_, i) => i % step === 0)
    .map((d) => ({ label: format(d, months.length > 12 ? 'MMM yy' : 'MMM'), frac: fracOf(d.getTime(), window) }))
}

export function windowLabel(range: Range, window: TimeWindow): string {
  const { start, end } = window
  if (range === 'week') return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
  if (range === 'month') return format(start, 'MMMM yyyy')
  if (range === 'year') return format(start, 'yyyy')
  return `${format(start, 'MMM yyyy')} – ${format(end, 'MMM yyyy')}`
}

/** Least-squares line through the points (in whatever space they are given). */
export function trendLine(pts: Array<{ x: number; y: number }>): { x1: number; y1: number; x2: number; y2: number } | null {
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

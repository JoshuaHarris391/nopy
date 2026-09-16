import { format } from 'date-fns'
import type { JournalEntry } from '../types/journal'

/**
 * Derived, read-only view of the journal organised as yearly books of
 * monthly pages. The journal store keeps `entries` in whatever order the last
 * mutation left them (new entries are prepended, date edits do not re-sort),
 * so this module is the single place that sorts. Everything here is pure;
 * `getJournalIndex` memoises per entries-array identity because Zustand hands
 * out a fresh array on every mutation and never mutates one in place.
 */

/** A calendar month in local time. `month` is 1–12. */
export interface MonthRef {
  year: number
  month: number
}

export interface MonthBucket extends MonthRef {
  /** 'YYYY-MM' */
  key: string
  count: number
  /** Newest first. */
  entries: JournalEntry[]
}

export interface Book {
  year: number
  count: number
  /** Only months that have entries, January → December. */
  months: MonthBucket[]
  monthByNumber: ReadonlyMap<number, MonthBucket>
  firstMonth: number
  lastMonth: number
}

export interface JournalIndex {
  /** createdAt descending; ties broken by id so the order is deterministic. */
  sorted: JournalEntry[]
  positionById: ReadonlyMap<string, number>
  /** Newest year first. */
  books: Book[]
  bookByYear: ReadonlyMap<number, Book>
  total: number
}

export interface Neighbours {
  olderId: string | null
  newerId: string | null
}

export function monthOf(iso: string): MonthRef {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { year: 1970, month: 1 }
  // Local wall-clock month, the same clock EntryCard uses to print the date.
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function monthKey(ref: MonthRef): string {
  return `${ref.year}-${String(ref.month).padStart(2, '0')}`
}

export function monthPath(ref: MonthRef): string {
  return `/journal/books/${ref.year}/${String(ref.month).padStart(2, '0')}`
}

export function monthLabel(month: number): string {
  return format(new Date(2000, month - 1, 1), 'MMMM')
}

export function sameMonth(a: MonthRef | null | undefined, b: MonthRef | null | undefined): boolean {
  return !!a && !!b && a.year === b.year && a.month === b.month
}

/** Accepts '2026' + '9' or '09'; returns null for anything that is not a real month. */
export function parseMonthParams(year?: string, month?: string): MonthRef | null {
  if (!year || !/^\d{4}$/.test(year)) return null
  if (month === undefined) return null
  if (!/^\d{1,2}$/.test(month)) return null
  const m = Number(month)
  if (m < 1 || m > 12) return null
  return { year: Number(year), month: m }
}

export function parseYearParam(year?: string): number | null {
  if (!year || !/^\d{4}$/.test(year)) return null
  return Number(year)
}

export function buildJournalIndex(entries: JournalEntry[]): JournalIndex {
  // Parse each timestamp once. An unparseable createdAt sinks to the oldest
  // end instead of poisoning the comparator with NaN.
  const time = new Map<string, number>()
  for (const e of entries) {
    const t = Date.parse(e.createdAt)
    time.set(e.id, Number.isNaN(t) ? 0 : t)
  }
  const sorted = [...entries].sort(
    (a, b) => (time.get(b.id)! - time.get(a.id)!) || a.id.localeCompare(b.id),
  )
  const positionById = new Map(sorted.map((e, i) => [e.id, i] as const))

  const years = new Map<number, Map<number, MonthBucket>>()
  for (const e of sorted) {
    const { year, month } = monthOf(e.createdAt)
    let months = years.get(year)
    if (!months) years.set(year, (months = new Map()))
    let bucket = months.get(month)
    if (!bucket) months.set(month, (bucket = { year, month, key: monthKey({ year, month }), count: 0, entries: [] }))
    bucket.entries.push(e)
    bucket.count++
  }

  const books: Book[] = [...years.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, monthByNumber]) => {
      const months = [...monthByNumber.values()].sort((a, b) => a.month - b.month)
      return {
        year,
        monthByNumber,
        months,
        count: months.reduce((n, m) => n + m.count, 0),
        firstMonth: months[0].month,
        lastMonth: months[months.length - 1].month,
      }
    })

  return {
    sorted,
    positionById,
    books,
    bookByYear: new Map(books.map((b) => [b.year, b])),
    total: entries.length,
  }
}

const cache = new WeakMap<JournalEntry[], JournalIndex>()

export function getJournalIndex(entries: JournalEntry[]): JournalIndex {
  let idx = cache.get(entries)
  if (!idx) {
    idx = buildJournalIndex(entries)
    cache.set(entries, idx)
  }
  return idx
}

export function getNeighbours(index: JournalIndex, id: string): Neighbours {
  const pos = index.positionById.get(id)
  if (pos === undefined) return { olderId: null, newerId: null }
  return {
    newerId: index.sorted[pos - 1]?.id ?? null,
    olderId: index.sorted[pos + 1]?.id ?? null,
  }
}

export function getMonthBucket(index: JournalIndex, ref: MonthRef): MonthBucket | null {
  return index.bookByYear.get(ref.year)?.monthByNumber.get(ref.month) ?? null
}

export function getMonthEntries(index: JournalIndex, ref: MonthRef): JournalEntry[] {
  return getMonthBucket(index, ref)?.entries ?? []
}

/**
 * Where the Journal tab lands: the current month if anything was written in
 * it, otherwise the newest month that has entries, otherwise the current
 * month (an empty journal still needs somewhere to show "your journal awaits").
 */
export function resolveLandingMonth(index: JournalIndex, now: Date = new Date()): MonthRef {
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 }
  if (getMonthBucket(index, current)) return current
  const newest = index.sorted[0]
  if (newest) return monthOf(newest.createdAt)
  return current
}

/**
 * Which month to open when a book is picked without a month: the latest month
 * with entries; for the current year with none written yet, the current
 * month; for any other empty year, January.
 */
export function resolveMonthInYear(index: JournalIndex, year: number, now: Date = new Date()): number {
  const book = index.bookByYear.get(year)
  if (book) return book.lastMonth
  if (year === now.getFullYear()) return now.getMonth() + 1
  return 1
}

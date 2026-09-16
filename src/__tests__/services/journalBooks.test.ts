import { describe, it, expect } from 'vitest'
import {
  buildJournalIndex, getJournalIndex, getNeighbours, monthOf,
  parseMonthParams, resolveLandingMonth, resolveMonthInYear,
} from '../../services/journalBooks'
import type { JournalEntry } from '../../types/journal'

/**
 * Build an entry dated by the LOCAL clock. Using the Date(y, m, d, h, min)
 * constructor keeps every assertion timezone independent: the entry lands in
 * whatever month the local wall clock says, which is exactly the month the
 * reader sees printed on its card.
 */
function entry(id: string, local: Date, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id,
    title: id,
    content: '',
    createdAt: local.toISOString(),
    updatedAt: local.toISOString(),
    mood: null,
    tags: [],
    summary: null,
    indexed: false,
    ...overrides,
  }
}

describe('journalBooks: yearly books of monthly pages', () => {
  it('sorts newest-first and buckets into years and months regardless of input order', () => {
    /**
     * The journal store never guarantees order: new entries are prepended and
     * editing a date does not re-sort. The index is the one place that sorts,
     * so the month scroll and next/previous navigation can trust it.
     *
     * Input: four entries given oldest-first, spanning Mar 2025, Sep 2026 (x2)
     * and Nov 2026.
     * Expected: sorted is newest-first; books are [2026, 2025]; 2026 has the
     * months Sep (2 entries) then Nov (1), with first/last month 9 and 11.
     */
    const entries = [
      entry('mar25', new Date(2025, 2, 10, 9, 0)),
      entry('sep26a', new Date(2026, 8, 3, 8, 0)),
      entry('sep26b', new Date(2026, 8, 20, 22, 0)),
      entry('nov26', new Date(2026, 10, 1, 7, 30)),
    ]

    const index = buildJournalIndex(entries)

    expect(index.sorted.map((e) => e.id)).toEqual(['nov26', 'sep26b', 'sep26a', 'mar25'])
    expect(index.books.map((b) => b.year)).toEqual([2026, 2025])
    const y2026 = index.bookByYear.get(2026)!
    expect(y2026.count).toBe(3)
    expect(y2026.months.map((m) => [m.month, m.count])).toEqual([[9, 2], [11, 1]])
    expect(y2026.firstMonth).toBe(9)
    expect(y2026.lastMonth).toBe(11)
    expect(y2026.monthByNumber.get(9)!.entries.map((e) => e.id)).toEqual(['sep26b', 'sep26a'])
  })

  it('finds chronological neighbours, continuing across month boundaries', () => {
    /**
     * Flicking through the diary is continuous: the page after the last entry
     * of March is the first entry of April, not a dead end. The newest entry
     * has no "newer" and the oldest has no "older", which is what disables the
     * chevrons at the ends.
     *
     * Input: entries on 31 Mar 23:30, 1 Apr 00:15 and 15 Apr (local time).
     * Expected: the March entry's newer neighbour is the 1 Apr entry; the
     * 15 Apr entry has no newer; the March entry has no older; an unknown id
     * has neither.
     */
    const entries = [
      entry('mar31', new Date(2026, 2, 31, 23, 30)),
      entry('apr01', new Date(2026, 3, 1, 0, 15)),
      entry('apr15', new Date(2026, 3, 15, 12, 0)),
    ]
    const index = buildJournalIndex(entries)

    expect(monthOf(entries[0].createdAt)).toEqual({ year: 2026, month: 3 })
    expect(monthOf(entries[1].createdAt)).toEqual({ year: 2026, month: 4 })

    expect(getNeighbours(index, 'mar31')).toEqual({ newerId: 'apr01', olderId: null })
    expect(getNeighbours(index, 'apr01')).toEqual({ newerId: 'apr15', olderId: 'mar31' })
    expect(getNeighbours(index, 'apr15')).toEqual({ newerId: null, olderId: 'apr01' })
    expect(getNeighbours(index, 'nope')).toEqual({ newerId: null, olderId: null })
  })

  it('lands on the current month when written in, else the newest month, else the current month', () => {
    /**
     * The Journal tab opens straight onto a month scroll. Which month matters
     * for daily use: if something was written this month, land there; if the
     * reader has been away, land on the most recent month that has anything
     * in it; an empty journal still needs a page to show its empty state on.
     *
     * Input: "now" fixed to 16 Sep 2026.
     * Expected: with a Sep 2026 entry → Sep 2026; with only a Jun 2025 entry
     * → Jun 2025; with no entries → Sep 2026.
     */
    const now = new Date(2026, 8, 16, 10, 0)

    const thisMonth = buildJournalIndex([entry('a', new Date(2026, 8, 2, 9, 0))])
    expect(resolveLandingMonth(thisMonth, now)).toEqual({ year: 2026, month: 9 })

    const older = buildJournalIndex([entry('b', new Date(2025, 5, 2, 9, 0))])
    expect(resolveLandingMonth(older, now)).toEqual({ year: 2025, month: 6 })

    expect(resolveLandingMonth(buildJournalIndex([]), now)).toEqual({ year: 2026, month: 9 })
  })

  it('opens a book on its latest written month and parses month URLs leniently', () => {
    /**
     * Clicking a book on the shelf goes to /journal/books/2025 with no month,
     * which resolves to that year's latest month. URLs are typed by people
     * too, so "9" and "09" both mean September while "13" is rejected.
     *
     * Input: a book with entries in Feb and Aug 2025; now = 2026.
     * Expected: 2025 resolves to August; the current year with nothing
     * written resolves to the current month; params parse as described.
     */
    const now = new Date(2026, 8, 16)
    const index = buildJournalIndex([
      entry('feb', new Date(2025, 1, 3)),
      entry('aug', new Date(2025, 7, 3)),
    ])

    expect(resolveMonthInYear(index, 2025, now)).toBe(8)
    expect(resolveMonthInYear(index, 2026, now)).toBe(9)

    expect(parseMonthParams('2025', '9')).toEqual({ year: 2025, month: 9 })
    expect(parseMonthParams('2025', '09')).toEqual({ year: 2025, month: 9 })
    expect(parseMonthParams('2025', '13')).toBeNull()
    expect(parseMonthParams('abcd', '09')).toBeNull()
  })

  it('reuses the index for the same entries array and rebuilds for a new one', () => {
    /**
     * Every journal view derives from this index, so it must be cheap to ask
     * for repeatedly. Zustand replaces the entries array on each mutation and
     * never mutates it in place, which makes array identity a safe cache key.
     *
     * Input: one array asked for twice, then a copy of it.
     * Expected: the same index object twice, then a different one.
     */
    const entries = [entry('a', new Date(2026, 0, 1))]
    const first = getJournalIndex(entries)
    expect(getJournalIndex(entries)).toBe(first)
    expect(getJournalIndex([...entries])).not.toBe(first)
  })
})

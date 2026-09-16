import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const idbStore = new Map<unknown, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: unknown) => idbStore.get(key)),
  set: vi.fn(async (key: unknown, value: unknown) => {
    idbStore.set(key, value)
  }),
  del: vi.fn(async (key: unknown) => {
    idbStore.delete(key)
  }),
}))

import { IndexView } from '../../components/index/IndexView'
import { useJournalStore } from '../../stores/journalStore'
import type { JournalEntry } from '../../types/journal'

function seed(id: string, title: string, local: Date): JournalEntry {
  return {
    id, title, content: `${title} body`, createdAt: local.toISOString(), updatedAt: local.toISOString(),
    mood: null, tags: [], summary: null, indexed: false,
  }
}

/** Titles of the rows currently shown, top to bottom. */
const rowTitles = () =>
  within(screen.getByRole('table')).getAllByRole('row').slice(1) // drop the header
    .filter((r) => r.querySelector('td:nth-child(2)'))
    .map((r) => r.querySelector('td:nth-child(2)')!.textContent)

describe('Index page: narrowing to a year and month', () => {
  beforeEach(() => {
    idbStore.clear()
    useJournalStore.setState({
      entries: [
        seed('a', 'March morning', new Date(2025, 2, 10)),
        seed('b', 'June evening', new Date(2025, 5, 4)),
        seed('c', 'September rain', new Date(2026, 8, 1)),
      ],
      loaded: true,
      lastError: null,
    })
  })
  afterEach(() => {
    cleanup()
  })

  it('offers only the years and months that have entries, and narrows the table to them', () => {
    /**
     * The index lists every entry, which for a long-running journal is far
     * too much to scan. The reader narrows it by year, then by month within
     * that year. The dropdowns offer only periods that have entries, so
     * there is never an empty choice, and the month list follows the chosen
     * year. Clearing the year clears the month with it.
     *
     * Input: entries in Mar 2025, Jun 2025 and Sep 2026. Choose 2025, then
     * June, then back to all years.
     * Expected: rows go from all three (newest first) → the two 2025 rows →
     * June only → all three; the Month control appears only while a year is
     * chosen and lists March and June.
     */
    render(<MemoryRouter><IndexView /></MemoryRouter>)

    expect(rowTitles()).toEqual(['September rain', 'June evening', 'March morning'])
    expect(screen.queryByRole('combobox', { name: 'Month' })).toBeNull()

    const yearSelect = screen.getByRole('combobox', { name: 'Year' })
    expect(within(yearSelect).getAllByRole('option').map((o) => o.textContent)).toEqual(['All years', '2026', '2025'])

    fireEvent.change(yearSelect, { target: { value: '2025' } })
    expect(rowTitles()).toEqual(['June evening', 'March morning'])

    const monthSelect = screen.getByRole('combobox', { name: 'Month' })
    expect(within(monthSelect).getAllByRole('option').map((o) => o.textContent)).toEqual(['All months', 'March', 'June'])

    fireEvent.change(monthSelect, { target: { value: '6' } })
    expect(rowTitles()).toEqual(['June evening'])

    fireEvent.change(yearSelect, { target: { value: '' } })
    expect(rowTitles()).toEqual(['September rain', 'June evening', 'March morning'])
    expect(screen.queryByRole('combobox', { name: 'Month' })).toBeNull()
  })

  it('combines the period with the keyword search', () => {
    /**
     * Period and keyword narrow together: "morning" in 2026 finds nothing
     * and says so, naming the period, while the same word across all years
     * finds the March entry.
     *
     * Input: search "morning" with 2026 chosen, then with all years.
     * Expected: an empty table with a "No entries match" notice for 2026,
     * then the March row.
     */
    render(<MemoryRouter><IndexView /></MemoryRouter>)

    fireEvent.change(screen.getByPlaceholderText(/Search entries/), { target: { value: 'morning' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Year' }), { target: { value: '2026' } })
    expect(rowTitles()).toEqual([])
    expect(screen.getByText('No entries match "morning" in 2026')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Year' }), { target: { value: '' } })
    expect(rowTitles()).toEqual(['March morning'])
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
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

import { InsightsView } from '../../components/insights/InsightsView'
import { useJournalStore } from '../../stores/journalStore'
import { usePageMemoryStore } from '../../stores/pageMemoryStore'
import { makeEntry, makeInsight } from '../fixtures/insight'

/** Dates inside the current year so the Year range always contains them. */
const year = new Date().getFullYear()
const at = (month: number, day: number) => new Date(year, month - 1, day, 10).toISOString()

describe('Insights page', () => {
  beforeEach(() => {
    idbStore.clear()
    // The range is remembered per location; MemoryRouter reuses one key, so
    // each test starts from a blank memory.
    usePageMemoryStore.getState().clear()
  })
  afterEach(() => {
    cleanup()
  })

  it('shows window metrics and every chart from the structured index, and re-buckets when the range changes', () => {
    /**
     * Insights is computed locally from index records. With the Year range
     * selected the metric cards summarise the year, the mood chart plots
     * every entry, the states chart has one series per state with legend
     * toggles, and the emotions heatmap has twelve monthly columns.
     * Input: four v2 entries in Jan–Mar of this year, writer moods 4, 6, 8
     * and an indexer-set 2; switch to Year; hide the anxiety series.
     * Expected: average mood 6.0 over 3 writer-rated entries; four mood
     * points; an anxiety series that disappears after its legend toggle; a
     * heatmap with 12 columns per row.
     */
    useJournalStore.setState({
      entries: [
        makeEntry({ id: 'a', createdAt: at(1, 10), mood: { value: 4, label: 'low' } }),
        makeEntry({ id: 'b', createdAt: at(2, 5), mood: { value: 6, label: 'neutral' } }),
        makeEntry({ id: 'c', createdAt: at(3, 2), mood: { value: 8, label: 'good' } }),
        makeEntry({ id: 'd', createdAt: at(3, 9), mood: { value: 2, label: 'low' }, moodSource: 'indexer' }),
      ],
      loaded: true,
      lastError: null,
    })
    render(<MemoryRouter><InsightsView /></MemoryRouter>)

    fireEvent.click(screen.getByRole('tab', { name: 'Year' }))

    expect(screen.getByTestId('metric-mood')).toHaveTextContent('6.0')
    expect(screen.getByTestId('metric-mood')).toHaveTextContent('3 writer-rated entries')
    expect(screen.getByTestId('chart-mood').querySelectorAll('[data-point]')).toHaveLength(4)

    const states = screen.getByTestId('chart-states')
    expect(states.querySelector('[data-series="anxiety"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Anxiety/ }))
    expect(states.querySelector('[data-series="anxiety"]')).toBeNull()
    expect(states.querySelector('[data-series="calm"]')).toBeNull() // calm has no confident values in the fixture

    const heat = screen.getByTestId('chart-emotions')
    const anxiousRow = heat.querySelector('[data-series="anxious"]')!
    expect(anxiousRow.querySelectorAll('[data-cell]')).toHaveLength(12)
    expect(screen.queryByTestId('coverage-hint')).toBeNull()
  })

  it('explains thin data: the coverage hint separates never-indexed entries from stale ones, each with its own fix', () => {
    /**
     * A new entry that has not been indexed yet is not a re-index problem,
     * so it must not be blamed on Settings (which rightly shows nothing to
     * re-index). A legacy entry is. The hint names each case with the
     * right link, and the index-based charts show an empty state.
     * Input: one never-indexed entry and one legacy entry this year.
     * Expected: the hint says 1 entry is not yet indexed with an Update
     * Index link to /index, and 1 entry was indexed with an older record
     * with a Settings link; states and emotions charts render their empty
     * text; a safety table is absent.
     */
    useJournalStore.setState({
      entries: [
        makeEntry({ id: 'n1', createdAt: at(2, 1), indexed: false, insight: null, indexVersion: 0 }),
        makeEntry({ id: 'l2', createdAt: at(2, 8), insight: null, indexVersion: 1 }),
      ],
      loaded: true,
      lastError: null,
    })
    render(<MemoryRouter><InsightsView /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Year' }))

    expect(screen.getByTestId('coverage-unindexed')).toHaveTextContent('1 entry of 2 in this period is not yet indexed')
    expect(screen.getByRole('link', { name: 'Update Index' })).toHaveAttribute('href', '/index')
    expect(screen.getByTestId('coverage-stale')).toHaveTextContent('1 entry was indexed with an older or incomplete record')
    expect(screen.getByRole('link', { name: 'Re-index in Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByTestId('chart-states').querySelector('[data-testid="chart-empty"]')).not.toBeNull()
    expect(screen.getByTestId('chart-emotions').querySelector('[data-testid="chart-empty"]')).not.toBeNull()
    expect(screen.queryByTestId('safety-table')).toBeNull()
  })

  it('lists safety flags for the period with a link to the entry', () => {
    /**
     * Safety flags are never averaged away, so any flagged entry in the
     * window is listed with its date, flag and evidence.
     * Input: one entry flagged "concern" this year.
     * Expected: a safety table row with the flag, the evidence and a link
     * to /journal/<id>.
     */
    useJournalStore.setState({
      entries: [makeEntry({ id: 's1', title: 'Hard night', createdAt: at(4, 3), insight: makeInsight({ safety: { flag: 'concern', evidence: 'I cannot keep going' } }) })],
      loaded: true,
      lastError: null,
    })
    render(<MemoryRouter><InsightsView /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Year' }))

    const table = screen.getByTestId('safety-table')
    expect(table).toHaveTextContent('concern')
    expect(table).toHaveTextContent('I cannot keep going')
    expect(screen.getByRole('link', { name: 'Hard night' })).toHaveAttribute('href', '/journal/s1')
  })
})

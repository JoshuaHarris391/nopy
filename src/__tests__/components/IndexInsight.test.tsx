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

import { IndexView } from '../../components/index/IndexView'
import { useJournalStore } from '../../stores/journalStore'
import { makeEntry, makeInsight } from '../fixtures/insight'

describe('Index page: structured index markers and detail panel', () => {
  beforeEach(() => {
    idbStore.clear()
    useJournalStore.setState({
      entries: [
        makeEntry({
          id: 'v2', title: 'Sunday, again',
          insight: makeInsight({ safety: { flag: 'monitor', evidence: "can't see the point of any of it" } }),
        }),
        makeEntry({
          id: 'legacy', title: 'An older day', createdAt: '2024-11-02T10:00:00.000Z',
          insight: null, indexVersion: 1, tags: ['work stress'], summary: 'A summary from the old index.',
        }),
      ],
      loaded: true,
      lastError: null,
    })
  })
  afterEach(() => {
    cleanup()
  })

  it('shows key markers in the row and the full record, with raw JSON, when expanded', () => {
    /**
     * The index table is where the writer sees what the instrument recorded
     * about each entry. The row shows the markers that matter at a glance
     * (a safety flag first, the strongest emotion, who was there); the
     * expanded panel shows every section; and "View raw index" exposes the
     * exact JSON stored, for anyone who wants to check the instrument.
     *
     * Input: one v2-indexed entry flagged "monitor" and one legacy entry.
     * Expected: the v2 row shows a "monitor" safety marker and "anxious 8";
     * the legacy row shows a "legacy" pill. Expanding the v2 row shows the
     * quote and Maya; clicking "View raw index" reveals JSON containing
     * indexVersion 2 and the quote text. Expanding the legacy row shows the
     * older-format note instead.
     */
    render(<MemoryRouter><IndexView /></MemoryRouter>)

    expect(screen.getByTestId('marker-safety')).toHaveTextContent('monitor')
    expect(screen.getByTestId('marker-emotion')).toHaveTextContent('anxious 8')
    expect(screen.getByTestId('marker-people')).toHaveTextContent('Maya')
    expect(screen.getByTestId('marker-legacy')).toHaveTextContent('legacy')

    const [expandV2, expandLegacy] = screen.getAllByRole('button', { name: 'Expand index details' })
    fireEvent.click(expandV2)
    expect(screen.getByText(/checking someones face first/)).toBeInTheDocument()
    expect(screen.getAllByText('Maya').length).toBeGreaterThan(1) // marker plus panel
    expect(screen.getByText('Focal event')).toBeInTheDocument()
    expect(screen.queryByTestId('raw-index')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'View raw index' }))
    const raw = screen.getByTestId('raw-index')
    expect(raw).toHaveTextContent('"indexVersion": 2')
    expect(raw).toHaveTextContent('checking someones face first')
    expect(raw).toHaveTextContent('"flag": "monitor"')

    fireEvent.click(expandLegacy)
    expect(screen.getByTestId('legacy-note')).toHaveTextContent('Indexed with an older format')
    expect(screen.getAllByText('A summary from the old index.').length).toBe(2) // row cell plus panel
  })
})

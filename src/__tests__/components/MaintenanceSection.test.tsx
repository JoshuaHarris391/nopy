import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

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

import { MaintenanceSection } from '../../components/settings/sections/MaintenanceSection'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useIndexingStore } from '../../stores/indexingStore'
import { makeEntry } from '../fixtures/insight'

describe('Settings: re-index un-indexed entries', () => {
  beforeEach(() => {
    idbStore.clear()
    useSettingsStore.setState({ apiKey: 'sk-test', provider: 'anthropic', privateMode: false })
    useIndexingStore.setState({ state: 'idle', result: null, error: null })
  })
  afterEach(() => {
    cleanup()
  })

  it('counts every entry without a usable record, names them, and indexes exactly those', async () => {
    /**
     * The Insights coverage hint and this Settings row must agree, and the
     * reader must be able to find the entries in question. "Un-indexed"
     * covers a never-indexed entry, a legacy v1 entry and a v2 entry whose
     * record could not be read; a full v2 entry is not counted.
     * Input: those four entries; click the button.
     * Expected: the row says 3, names the three titles, and the store is
     * asked to index with the 'needed' mode.
     */
    useJournalStore.setState({
      entries: [
        makeEntry({ id: 'new', title: 'Fresh page', indexed: false, insight: null, indexVersion: 0 }),
        makeEntry({ id: 'legacy', title: 'Old summary', insight: null, indexVersion: 1 }),
        makeEntry({ id: 'dropped', title: 'Broken record', insight: null, indexVersion: 2 }),
        makeEntry({ id: 'ok', title: 'Complete' }),
      ],
      loaded: true,
    })
    const processEntries = vi.fn(async () => 3)
    useJournalStore.setState({ processEntries })

    render(<MaintenanceSection />)

    expect(screen.getByText('Re-index un-indexed entries (3)')).toBeInTheDocument()
    const description = screen.getByTestId('unindexed-description')
    expect(description).toHaveTextContent('"Fresh page", "Old summary", "Broken record"')
    expect(description).not.toHaveTextContent('Complete')

    fireEvent.click(screen.getByRole('button', { name: /Re-index Un-indexed/ }))
    expect(processEntries).toHaveBeenCalledTimes(1)
    expect((processEntries.mock.calls[0] as unknown[])[1]).toBe('needed')
  })

  it('hides the row when every entry has a usable record', () => {
    /**
     * Nothing to fix means no row, so the section cannot nag.
     * Input: one full v2 entry.
     * Expected: no "un-indexed" row; the Force Update button remains.
     */
    useJournalStore.setState({ entries: [makeEntry()], loaded: true })
    render(<MaintenanceSection />)
    expect(screen.queryByText(/Re-index un-indexed entries/)).toBeNull()
    expect(screen.getByRole('button', { name: /Force Update Index/ })).toBeInTheDocument()
  })
})

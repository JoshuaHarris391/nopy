import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

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

/**
 * Pretend we are inside Tauri with a journal on disk: the reveal helper is
 * spied on so the test asserts the wiring, not Finder.
 */
const { revealSpy } = vi.hoisted(() => ({ revealSpy: vi.fn(async () => {}) }))
vi.mock('../../services/fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/fs')>()),
  hasFileSystem: () => true,
  revealEntryOnDisk: revealSpy,
}))

import { EntryEditor } from '../../components/journal/EntryEditor'
import { useJournalStore } from '../../stores/journalStore'
import { useJournalNavStore } from '../../stores/journalNavStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { makeEntry } from '../fixtures/insight'

describe('Entry view: show file location', () => {
  beforeEach(() => {
    idbStore.clear()
    vi.clearAllMocks()
    useJournalNavStore.getState().clear()
    useSettingsStore.setState({ journalPath: '/Users/me/journal', privateMode: false })
  })
  afterEach(() => {
    cleanup()
  })

  it('reveals the entry\'s markdown file from the folder button in the header', () => {
    /**
     * Each entry is a markdown file in the journal folder. The folder button
     * in the top-right of the entry view opens that file's location so the
     * writer can find it outside the app.
     * Input: an entry saved to disk as 2025-03-14-sunday-again.md; open it
     * and click the folder button.
     * Expected: the reveal helper is called with that entry and the journal
     * path.
     */
    const entry = makeEntry({ id: 'e1', sourceFilename: '2025-03-14-sunday-again.md' })
    useJournalStore.setState({ entries: [entry], loaded: true, lastError: null })
    render(
      <MemoryRouter initialEntries={['/journal/e1']}>
        <Routes>
          <Route path="journal/:id" element={<EntryEditor />} />
        </Routes>
      </MemoryRouter>,
    )

    const button = screen.getByRole('button', { name: 'Show file location' })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(revealSpy).toHaveBeenCalledTimes(1)
    const [calledEntry, calledPath] = revealSpy.mock.calls[0] as unknown[]
    expect(calledEntry).toMatchObject({ id: 'e1', sourceFilename: '2025-03-14-sunday-again.md' })
    expect(calledPath).toBe('/Users/me/journal')
  })

  it('is disabled until the entry has been written to disk', () => {
    /**
     * A freshly synced or colliding entry may not have a file yet; the
     * button waits rather than revealing nothing.
     * Input: an entry with no sourceFilename.
     * Expected: the folder button is disabled and clicking does nothing.
     */
    useJournalStore.setState({ entries: [makeEntry({ id: 'e2', sourceFilename: undefined })], loaded: true, lastError: null })
    render(
      <MemoryRouter initialEntries={['/journal/e2']}>
        <Routes>
          <Route path="journal/:id" element={<EntryEditor />} />
        </Routes>
      </MemoryRouter>,
    )
    const button = screen.getByRole('button', { name: 'Show file location' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(revealSpy).not.toHaveBeenCalled()
  })
})

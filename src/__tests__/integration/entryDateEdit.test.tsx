import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, waitFor, act, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * In-memory mock of idb-keyval. journalStore persists entries through these
 * calls; jsdom has no IndexedDB so a real call would throw. A single Map
 * emulates the get/set/del surface the store uses.
 */
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

import { EntryEditor } from '../../components/journal/EntryEditor'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { JournalEntry } from '../../types/journal'

const ENTRY_ID = '11111111-1111-1111-1111-111111111111'

function seedEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: ENTRY_ID,
    title: 'A quiet morning',
    content: 'Woke up early and watched the light come in.',
    createdAt: '2026-06-15T09:30:00.000Z',
    updatedAt: '2026-06-15T09:30:00.000Z',
    mood: null,
    tags: [],
    summary: null,
    indexed: false,
    sourceFilename: 'a-quiet-morning.md',
    ...overrides,
  }
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={[`/journal/${ENTRY_ID}`]}>
      <Routes>
        <Route path="/journal/:id" element={<EntryEditor />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Editing entry date/time in the viewer', () => {
  beforeEach(() => {
    idbStore.clear()
    // journalPath is read by updateEntry's save path. In jsdom there's no
    // Tauri filesystem, so saveEntryToDisk no-ops regardless, but seeding it
    // keeps the store path realistic.
    useSettingsStore.setState({ journalPath: '/test/journal' })
    useJournalStore.setState({ entries: [seedEntry()], loaded: true, lastError: null })
  })

  afterEach(() => {
    cleanup()
  })

  it('persists an edited time to the entry, keeping the same calendar day', async () => {
    /**
     * The entry viewer shows the entry's date/time and lets the user correct
     * it inline. This verifies the core wire-through: opening the picker,
     * changing the time, and saving updates the entry's `createdAt` in the
     * store (which is what entryToMarkdown writes to the .md frontmatter).
     *
     * The expected ISO is computed with the same local-time logic the picker
     * uses (setHours on the existing date) so the assertion is timezone
     * independent — it proves "the chosen wall-clock time was stored" rather
     * than hard-coding a UTC string that only holds in one timezone.
     *
     * Input: seeded entry at 09:30 on 2026-06-15; user opens the date picker
     * and sets the time field to 14:45, then presses Cmd+S.
     * Expected: entries[0].createdAt is 14:45 local on the same day.
     */
    renderEditor()

    // The load effect copies the seeded entry into the editor's local state.
    await screen.findByDisplayValue('A quiet morning')

    const dateButton = screen.getByRole('button', { name: /edit entry date and time/i })
    await act(async () => {
      fireEvent.click(dateButton)
    })

    const timeInput = await screen.findByLabelText('Entry time')
    await act(async () => {
      fireEvent.change(timeInput, { target: { value: '14:45' } })
    })

    // Cmd+S flushes the save immediately, bypassing the autosave debounce.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }))
    })

    const expected = (() => {
      const d = new Date('2026-06-15T09:30:00.000Z')
      d.setHours(14, 45, 0, 0)
      return d.toISOString()
    })()

    await waitFor(() => {
      const entry = useJournalStore.getState().entries.find((e) => e.id === ENTRY_ID)
      expect(entry?.createdAt).toBe(expected)
    })
  })

  it('does not wipe the date when the time field is cleared', async () => {
    /**
     * Clearing the native time input emits an empty string. The picker must
     * treat that as "no change" rather than producing an invalid date, so the
     * stored timestamp is never corrupted. This guards the empty-input branch
     * of the commit handler.
     *
     * Input: user opens the picker and clears the time field, then Cmd+S.
     * Expected: createdAt is unchanged from the seeded value.
     */
    renderEditor()
    await screen.findByDisplayValue('A quiet morning')

    const dateButton = screen.getByRole('button', { name: /edit entry date and time/i })
    await act(async () => {
      fireEvent.click(dateButton)
    })

    const timeInput = await screen.findByLabelText('Entry time')
    await act(async () => {
      fireEvent.change(timeInput, { target: { value: '' } })
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }))
    })

    await waitFor(() => {
      const entry = useJournalStore.getState().entries.find((e) => e.id === ENTRY_ID)
      expect(entry?.createdAt).toBe('2026-06-15T09:30:00.000Z')
    })
  })
})

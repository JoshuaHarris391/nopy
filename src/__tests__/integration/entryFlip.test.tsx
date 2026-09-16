import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, waitFor, act, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet, useLocation, useNavigate } from 'react-router-dom'

/**
 * In-memory mock of idb-keyval. journalStore persists entries through these
 * calls; jsdom has no IndexedDB so a real call would throw.
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
import { useJournalNavStore } from '../../stores/journalNavStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { JournalEntry } from '../../types/journal'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' // newest, September
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' // August
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' // oldest, July

function seed(id: string, title: string, local: Date): JournalEntry {
  return {
    id,
    title,
    content: `${title} body`,
    createdAt: local.toISOString(),
    updatedAt: local.toISOString(),
    mood: null,
    tags: [],
    summary: null,
    indexed: false,
    sourceFilename: `${title.toLowerCase().replace(/\s+/g, '-')}.md`,
  }
}

/** Shows where the router is and offers a real history Back, like the browser's. */
function Probe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <div data-testid="path">{location.pathname}</div>
      <button onClick={() => navigate(-1)}>History back</button>
      <Outlet />
    </>
  )
}

function renderAt(history: string[]) {
  return render(
    <MemoryRouter initialEntries={history} initialIndex={history.length - 1}>
      <Routes>
        <Route element={<Probe />}>
          <Route path="/journal/:id" element={<EntryEditor />} />
          <Route path="/journal/books/:year/:month" element={<div>Month scroll</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('Flipping between entries in the editor', () => {
  beforeEach(() => {
    idbStore.clear()
    useSettingsStore.setState({ journalPath: '/test/journal' })
    useJournalNavStore.getState().clear()
    useJournalStore.setState({
      entries: [
        seed(B, 'August walk', new Date(2026, 7, 12, 9, 0)),
        seed(C, 'July storm', new Date(2026, 6, 4, 21, 0)),
        seed(A, 'September light', new Date(2026, 8, 3, 8, 0)),
      ],
      loaded: true,
      lastError: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('turns forward and back through time, leaving a single history step to the month', async () => {
    /**
     * The diary's page order is time order: "next" is the newer entry. Each
     * flip replaces the current history entry rather than pushing one, so
     * after flicking through several pages one Back still returns to the
     * month scroll the reader came from, exactly as if only one page had been
     * opened.
     *
     * Input: history [August month, entry B]; click Next; click Previous
     * twice; click History back.
     * Expected: B → A → B → C by title, and Back lands on /journal/books/2026/08.
     */
    renderAt(['/journal/books/2026/08', `/journal/${B}`])
    await screen.findByDisplayValue('August walk')

    fireEvent.click(screen.getByRole('button', { name: /^next entry/i }))
    await screen.findByDisplayValue('September light')
    expect(screen.getByTestId('path')).toHaveTextContent(`/journal/${A}`)

    fireEvent.click(screen.getByRole('button', { name: /^previous entry/i }))
    await screen.findByDisplayValue('August walk')
    fireEvent.click(screen.getByRole('button', { name: /^previous entry/i }))
    await screen.findByDisplayValue('July storm')

    fireEvent.click(screen.getByRole('button', { name: 'History back' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/journal/books/2026/08'))
  })

  it('saves pending edits before turning the page', async () => {
    /**
     * Autosave waits 1.5s after the last keystroke. Turning the page inside
     * that window must not lose what was typed: the flip flushes the save
     * first, then navigates.
     *
     * Input: open B, change the body text, click Next immediately.
     * Expected: B's content in the store is the new text, and A is showing.
     */
    renderAt([`/journal/${B}`])
    await screen.findByDisplayValue('August walk')

    const textarea = screen.getByPlaceholderText('Begin writing...')
    fireEvent.change(textarea, { target: { value: 'Rewritten on the way out' } })
    fireEvent.click(screen.getByRole('button', { name: /^next entry/i }))

    await screen.findByDisplayValue('September light')
    await waitFor(() => {
      expect(useJournalStore.getState().entries.find((e) => e.id === B)?.content).toBe('Rewritten on the way out')
    })
  })

  it('disables the chevrons at the newest and oldest entries', async () => {
    /**
     * At either end of the diary there is no page to turn to. The chevron is
     * disabled rather than hidden so the layout does not shift between pages.
     *
     * Input: open A (newest), then C (oldest).
     * Expected: Next disabled on A; Previous disabled on C.
     */
    const first = renderAt([`/journal/${A}`])
    await screen.findByDisplayValue('September light')
    expect(screen.getByRole('button', { name: /^next entry/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^previous entry/i })).toBeEnabled()
    first.unmount()

    renderAt([`/journal/${C}`])
    await screen.findByDisplayValue('July storm')
    expect(screen.getByRole('button', { name: /^previous entry/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^next entry/i })).toBeEnabled()
  })

  it('turns the page with Cmd+] and Cmd+[', async () => {
    /**
     * Keyboard users flip with the bracket keys (Option+arrow moves the caret
     * by word inside the text, so it is not used).
     *
     * Input: open B, press Cmd+], then Cmd+[.
     * Expected: A is showing, then B again.
     */
    renderAt([`/journal/${B}`])
    await screen.findByDisplayValue('August walk')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', metaKey: true }))
    })
    await screen.findByDisplayValue('September light')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', metaKey: true }))
    })
    await screen.findByDisplayValue('August walk')
  })

  it('Close returns to the month of the entry now showing and marks it for reveal', async () => {
    /**
     * After flipping across a month boundary, "back to the journal" should
     * mean the month of the page currently open, scrolled to that entry, not
     * the month the reader started in. The editor records the entry to reveal
     * and navigates to its month; MonthScroll then scrolls to it.
     *
     * Input: open B (August), flip Next to A (September), click Close.
     * Expected: path is /journal/books/2026/09 and revealEntryId is A.
     */
    renderAt([`/journal/${B}`])
    await screen.findByDisplayValue('August walk')

    fireEvent.click(screen.getByRole('button', { name: /^next entry/i }))
    await screen.findByDisplayValue('September light')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/journal/books/2026/09'))
    expect(useJournalNavStore.getState().revealEntryId).toBe(A)
  })
})

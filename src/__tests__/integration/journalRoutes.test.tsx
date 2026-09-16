import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'

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

import { JournalLanding } from '../../components/journal/books/JournalLanding'
import { BookshelfView } from '../../components/journal/books/BookshelfView'
import { BookView } from '../../components/journal/books/BookView'
import { useJournalStore } from '../../stores/journalStore'
import { useJournalNavStore } from '../../stores/journalNavStore'
import type { JournalEntry } from '../../types/journal'

const now = new Date()
const Y = now.getFullYear()
const M = String(now.getMonth() + 1).padStart(2, '0')
const LAST = Y - 1

function seed(id: string, local: Date): JournalEntry {
  return {
    id, title: id, content: 'words', createdAt: local.toISOString(), updatedAt: local.toISOString(),
    mood: null, tags: [], summary: null, indexed: false,
  }
}

function Probe() {
  const location = useLocation()
  return (
    <>
      <div data-testid="path">{location.pathname}</div>
      <Outlet />
    </>
  )
}

/** The app's journal routes, minus AppShell. */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Probe />}>
          <Route index element={<Navigate to="/journal" replace />} />
          <Route path="journal" element={<JournalLanding />} />
          <Route path="journal/books" element={<BookshelfView />} />
          <Route path="journal/books/:year/:month?" element={<BookView />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const expectPath = (p: string) => waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(p))

describe('Journal routes: landing, books and month tabs', () => {
  beforeEach(() => {
    idbStore.clear()
    useJournalNavStore.getState().clear()
    useJournalStore.setState({ entries: [], loaded: true, lastError: null })
  })
  afterEach(() => {
    cleanup()
  })

  it('lands on the current month when it has entries', async () => {
    /**
     * Daily use should cost no clicks: opening the Journal tab goes straight
     * to this month's page, with the greeting only that page shows.
     *
     * Input: one entry dated now; open "/".
     * Expected: path is /journal/books/<year>/<month> and the greeting is shown.
     */
    useJournalStore.setState({ entries: [seed('today', now)] })
    renderAt('/')
    await expectPath(`/journal/books/${Y}/${M}`)
    expect(screen.getByText(/How are you arriving today/)).toBeInTheDocument()
  })

  it('lands on the newest written month when this month is empty', async () => {
    /**
     * After time away, the reader lands where they last wrote rather than on
     * an empty page.
     *
     * Input: only an entry in March of last year; open "/".
     * Expected: path is /journal/books/<last year>/03.
     */
    useJournalStore.setState({ entries: [seed('march', new Date(LAST, 2, 15, 10, 0))] })
    renderAt('/')
    await expectPath(`/journal/books/${LAST}/03`)
  })

  it('shows the empty-journal invitation when nothing has been written', async () => {
    /**
     * A brand-new journal still needs a page: the current month, showing the
     * invitation to write a first entry.
     *
     * Input: no entries; open "/".
     * Expected: "Your journal awaits" is shown.
     */
    renderAt('/')
    expect(await screen.findByText('Your journal awaits')).toBeInTheDocument()
  })

  it('opens a book on its latest month and rejects an impossible month', async () => {
    /**
     * Picking a book from the shelf goes to the year alone; the app resolves
     * that to the latest written month. A malformed month in the URL falls
     * back to the landing page instead of rendering a broken book.
     *
     * Input: entries in Mar and Jun of last year; open /journal/books/<year>,
     * then /journal/books/<year>/13.
     * Expected: ".../06", then the landing month (".../06" again here).
     */
    useJournalStore.setState({
      entries: [seed('mar', new Date(LAST, 2, 15)), seed('jun', new Date(LAST, 5, 2))],
    })
    const first = renderAt(`/journal/books/${LAST}`)
    await expectPath(`/journal/books/${LAST}/06`)
    first.unmount()

    renderAt(`/journal/books/${LAST}/13`)
    await expectPath(`/journal/books/${LAST}/06`)
  })

  it('month tabs, arrow keys and the breadcrumb navigate the book', async () => {
    /**
     * The thumb index is the way around a year: written months are clickable
     * tabs, empty months are muted and disabled, arrow keys step between the
     * written ones, and the breadcrumb climbs back to the shelf where the
     * book shows its entry count.
     *
     * Input: entries in Mar (x2) and Jun of last year; open March; click the
     * June tab; press ArrowLeft on it; click "Shelf".
     * Expected: path moves to /06, back to /03, then /journal/books where a
     * book labelled "<year>, 3 entries" is on the shelf; May's tab is disabled.
     */
    useJournalStore.setState({
      entries: [
        seed('mar1', new Date(LAST, 2, 15)),
        seed('mar2', new Date(LAST, 2, 20)),
        seed('jun', new Date(LAST, 5, 2)),
      ],
    })
    renderAt(`/journal/books/${LAST}/03`)
    await expectPath(`/journal/books/${LAST}/03`)

    expect(screen.getByRole('tab', { name: /^May, no entries/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('tab', { name: /^June, 1 entry/ }))
    await expectPath(`/journal/books/${LAST}/06`)
    expect(screen.getByRole('tab', { name: /^June/ })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(screen.getByRole('tab', { name: /^June/ }), { key: 'ArrowLeft' })
    await expectPath(`/journal/books/${LAST}/03`)

    fireEvent.click(screen.getByRole('link', { name: 'Shelf' }))
    await expectPath('/journal/books')
    expect(screen.getByRole('button', { name: `${LAST}, 3 entries` })).toBeInTheDocument()
  })
})

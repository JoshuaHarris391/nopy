import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, waitFor, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'

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
import { InsightsView } from '../../components/insights/InsightsView'
import { EntryEditor } from '../../components/journal/EntryEditor'
import { HistoryMirror } from '../../app/HistoryMirror'
import { ROOT_STATE, useNavigationStore } from '../../stores/navigationStore'
import { usePageMemoryStore } from '../../stores/pageMemoryStore'
import { useJournalNavStore } from '../../stores/journalNavStore'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { JournalEntry } from '../../types/journal'

const RAIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function seed(id: string, title: string, local: Date): JournalEntry {
  return {
    id, title, content: `${title} body`, createdAt: local.toISOString(), updatedAt: local.toISOString(),
    mood: null, tags: [], summary: null, indexed: false, sourceFilename: `${id}.md`,
  }
}

/**
 * The app shell's part in this: mirrors history into navigationStore, shows
 * where the router is, and offers the two ways the reader moves between
 * pages — the rail (a root push, as Sidebar and BottomNav do) and a link
 * inside content.
 */
function Probe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <HistoryMirror />
      <div data-testid="path">{location.pathname}</div>
      <button onClick={() => navigate('/index', { state: ROOT_STATE })}>Rail: Index</button>
      <Link to="/index">Content link to Index</Link>
      <Outlet />
    </>
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Probe />}>
          <Route path="/index" element={<IndexView />} />
          <Route path="/insights" element={<InsightsView />} />
          <Route path="/journal/:id" element={<EntryEditor />} />
          <Route path="/journal/books/:year/:month" element={<div>Month scroll</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const expectPath = (p: string) => waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(p))
const scrollPane = () => document.querySelector<HTMLElement>('.overflow-y-auto')!
const searchBox = () => screen.getByPlaceholderText(/Search entries/) as HTMLInputElement
const rowTitles = () =>
  within(screen.getByRole('table')).getAllByRole('row').slice(1)
    .filter((r) => r.querySelector('td:nth-child(2)'))
    .map((r) => r.querySelector('td:nth-child(2)')!.textContent)

describe('Back arrow: returning to the page the reader came from, as they left it', () => {
  beforeEach(() => {
    idbStore.clear()
    useSettingsStore.setState({ journalPath: '/test/journal' })
    useNavigationStore.setState({ entries: [], index: -1 })
    usePageMemoryStore.getState().clear()
    useJournalNavStore.getState().clear()
    useJournalStore.setState({
      entries: [
        seed(RAIN, 'September rain', new Date(2026, 8, 1, 10)),
        seed('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'June evening', new Date(2025, 5, 4, 10)),
        seed('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'March morning', new Date(2025, 2, 10, 10)),
      ],
      loaded: true,
      lastError: null,
    })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opening an entry from a filtered, scrolled Index and coming back finds the Index as it was', async () => {
    /**
     * The reader narrows the index, opens a row half-way down, reads, and
     * comes back. Before this feature the index reset to the top with every
     * filter cleared. Now the editor's arrow says where it goes, history Back
     * lands on the same index page, and that page remembers its search, the
     * row that was expanded and how far it was scrolled. The row just closed
     * is tinted so the eye lands on it, and the reveal request is consumed.
     *
     * Input: on /index (opened from the rail, so no arrow), search "rain",
     * expand the row, scroll to 300, click the row; click "Back to Index".
     * Expected: no arrow on the index; the editor shows "Back to Index";
     * back on /index the search reads "rain", the row is still expanded,
     * scrollTop is 300, the row carries the returned tint, revealEntryId is
     * null.
     */
    renderAt('/index')
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull()

    fireEvent.change(searchBox(), { target: { value: 'rain' } })
    expect(rowTitles()).toEqual(['September rain'])
    fireEvent.click(screen.getByRole('button', { name: 'Expand index details' }))
    scrollPane().scrollTop = 300
    fireEvent.scroll(scrollPane())

    fireEvent.click(screen.getByText('September rain'))
    await expectPath(`/journal/${RAIN}`)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Entry title' })).toHaveValue('September rain'))

    fireEvent.click(screen.getByRole('button', { name: 'Back to Index' }))
    await expectPath('/index')

    expect(searchBox().value).toBe('rain')
    expect(rowTitles()).toEqual(['September rain'])
    expect(screen.getByRole('button', { name: 'Collapse index details' })).toHaveAttribute('aria-expanded', 'true')
    expect(scrollPane().scrollTop).toBe(300)
    expect(document.querySelector(`tr[data-entry-id="${RAIN}"]`)).toHaveClass('entry-card--returned')
    expect(useJournalNavStore.getState().revealEntryId).toBeNull()
  })

  it('a fresh visit from the rail starts the Index clean', async () => {
    /**
     * Remembering is tied to the history entry, not the page. Choosing Index
     * from the rail while reading an entry is a new visit and should not
     * carry over the search or scroll the reader left on the previous one.
     *
     * Input: on /index search "rain" and scroll; open the row; from the
     * editor choose Index from the rail.
     * Expected: the search is empty, every row shows, scrollTop is 0, and
     * there is no arrow.
     */
    renderAt('/index')
    fireEvent.change(searchBox(), { target: { value: 'rain' } })
    scrollPane().scrollTop = 300
    fireEvent.scroll(scrollPane())
    fireEvent.click(screen.getByText('September rain'))
    await expectPath(`/journal/${RAIN}`)

    fireEvent.click(screen.getByRole('button', { name: 'Rail: Index' }))
    await expectPath('/index')

    expect(searchBox().value).toBe('')
    expect(rowTitles()).toEqual(['September rain', 'June evening', 'March morning'])
    expect(scrollPane().scrollTop).toBe(0)
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull()
  })

  it('the arrow appears only on pages reached from inside content, and names the page behind', async () => {
    /**
     * A page the reader chose from the rail is a root: the rail is its way
     * home and an arrow there would only echo it. A page reached by a link
     * inside content is one level in, and the arrow says what it leads
     * back to.
     *
     * Input: start on /insights; follow a content link to /index; go back.
     * Expected: no arrow on Insights; "Back to Insights" on Index; clicking
     * it returns to /insights, again with no arrow.
     */
    renderAt('/insights')
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: 'Content link to Index' }))
    await expectPath('/index')
    fireEvent.click(screen.getByRole('button', { name: 'Back to Insights' }))
    await expectPath('/insights')
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull()
  })
})

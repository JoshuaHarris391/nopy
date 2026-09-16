import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, waitFor, act, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet, useLocation } from 'react-router-dom'

/**
 * In-memory mock of idb-keyval. The journal and profile stores persist
 * through these calls; jsdom has no IndexedDB so a real call would throw.
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

/**
 * The three AI-related settings sections pull in provider model hooks, the
 * local-server probe and Tauri plugins. None of that matters here — the
 * question is only whether SettingsView renders them — so each becomes a
 * labelled stub.
 */
vi.mock('../../components/settings/sections/ApiSection', () => ({
  ApiSection: () => <div>AI Provider section</div>,
}))
vi.mock('../../components/settings/sections/TherapySection', () => ({
  TherapySection: () => <div>Therapy section</div>,
}))
vi.mock('../../components/settings/sections/MaintenanceSection', () => ({
  MaintenanceSection: () => <div>Maintenance section</div>,
}))

// Imports must follow vi.mock so the modules see the mocked deps.
import { SettingsView } from '../../components/settings/SettingsView'
import { Sidebar } from '../../components/sidebar/Sidebar'
import { BottomNav } from '../../components/sidebar/BottomNav'
import { PrivateModeGuard } from '../../app/PrivateModeGuard'
import { EntryEditor } from '../../components/journal/EntryEditor'
import { useSettingsStore } from '../../stores/settingsStore'
import { useJournalStore } from '../../stores/journalStore'

beforeEach(() => {
  idbStore.clear()
  localStorage.clear()
  useSettingsStore.setState({ privateMode: false, apiKey: '', sidebarCollapsed: false })
  useJournalStore.setState({ entries: [], loaded: true, lastError: null })
})
afterEach(() => {
  cleanup()
})

describe('Private mode: the Settings toggle', () => {
  it('hides the AI sections while on and brings them back when switched off', () => {
    /**
     * Private mode is meant to be a single big switch: flip it and every
     * AI-related setting (therapy style, provider/API keys, force re-index)
     * disappears, while the switch itself stays so the user can turn it back.
     *
     * Input: render Settings with private mode off; click the switch; click it
     * again.
     * Expected: the three AI sections render, then vanish (switch still on
     * screen and checked), then render again.
     */
    render(
      <MemoryRouter>
        <SettingsView />
      </MemoryRouter>,
    )

    const toggle = screen.getByRole('switch', { name: 'Private mode' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('AI Provider section')).toBeInTheDocument()
    expect(screen.getByText('Therapy section')).toBeInTheDocument()
    expect(screen.getByText('Maintenance section')).toBeInTheDocument()

    fireEvent.click(toggle)

    expect(useSettingsStore.getState().privateMode).toBe(true)
    expect(screen.getByRole('switch', { name: 'Private mode' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Private mode is on')).toBeInTheDocument()
    expect(screen.queryByText('AI Provider section')).not.toBeInTheDocument()
    expect(screen.queryByText('Therapy section')).not.toBeInTheDocument()
    expect(screen.queryByText('Maintenance section')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Private mode' }))

    expect(useSettingsStore.getState().privateMode).toBe(false)
    expect(screen.getByText('AI Provider section')).toBeInTheDocument()
    expect(screen.getByText('Therapy section')).toBeInTheDocument()
    expect(screen.getByText('Maintenance section')).toBeInTheDocument()
  })
})

describe('Private mode: navigation', () => {
  it('the sidebar keeps only Journal and the settings cog, and shows a Private badge', () => {
    /**
     * The "Understand" half of the sidebar (Chat, Context, Profile, Insights, Index) is
     * exactly what private mode removes. The footer's API connection status is
     * also LLM information, so it is replaced by a small "Private" marker.
     *
     * Input: render the expanded sidebar with private mode off, then on.
     * Expected: five links and "No API key" first; then only the Journal link,
     * no "Understand" label, the Settings cog still there, and "Private".
     */
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )

    for (const label of ['Journal', 'Chat', 'Context', 'Profile', 'Insights', 'Index']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText('Understand')).toBeInTheDocument()
    expect(screen.getByText('No API key')).toBeInTheDocument()

    act(() => useSettingsStore.setState({ privateMode: true }))

    expect(screen.getByRole('link', { name: 'Journal' })).toBeInTheDocument()
    for (const label of ['Chat', 'Context', 'Profile', 'Insights', 'Index']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Understand')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(screen.queryByText('No API key')).not.toBeInTheDocument()
  })

  it('the mobile bottom nav keeps only Journal and Settings', () => {
    /**
     * Phones use the bottom tab bar instead of the sidebar, so it must shrink
     * the same way or the hidden screens would still be one tap away.
     *
     * Input: render BottomNav with private mode on.
     * Expected: Journal and Settings links only.
     */
    useSettingsStore.setState({ privateMode: true })
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Journal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    for (const label of ['Chat', 'Context', 'Profile', 'Insights', 'Index']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument()
    }
  })

  it('AI routes bounce back to the journal while private mode is on', async () => {
    /**
     * Hiding the links is not enough: a typed URL or a stale history entry can
     * still reach /chat. The route guard sends such visits to the journal, and
     * lets them through again once private mode is off.
     *
     * Input: a mini route tree with the guard around a "chat page" stub; open
     * /chat with private mode on, then again with it off.
     * Expected: path becomes /journal; then the chat stub renders at /chat.
     */
    function Probe() {
      const location = useLocation()
      return (
        <>
          <div data-testid="path">{location.pathname}</div>
          <Outlet />
        </>
      )
    }
    const renderAt = (path: string) =>
      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Probe />}>
              <Route path="journal" element={<div>journal page</div>} />
              <Route element={<PrivateModeGuard />}>
                <Route path="chat" element={<div>chat page</div>} />
                <Route path="insights" element={<div>insights page</div>} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>,
      )

    useSettingsStore.setState({ privateMode: true })
    const first = renderAt('/chat')
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/journal'))
    expect(screen.getByText('journal page')).toBeInTheDocument()
    expect(screen.queryByText('chat page')).not.toBeInTheDocument()
    first.unmount()

    useSettingsStore.setState({ privateMode: false })
    renderAt('/chat')
    expect(screen.getByTestId('path')).toHaveTextContent('/chat')
    expect(screen.getByText('chat page')).toBeInTheDocument()
  })

  it('the Insights route is guarded like every other AI-derived surface', async () => {
    /**
     * Insights is computed locally, but only from records an LLM produced,
     * so private mode treats it as part of the "Understand" half.
     * Input: open /insights with private mode on.
     * Expected: path becomes /journal.
     */
    function Probe() {
      const location = useLocation()
      return (<><div data-testid="path">{location.pathname}</div><Outlet /></>)
    }
    useSettingsStore.setState({ privateMode: true })
    render(
      <MemoryRouter initialEntries={['/insights']}>
        <Routes>
          <Route element={<Probe />}>
            <Route path="journal" element={<div>journal page</div>} />
            <Route element={<PrivateModeGuard />}>
              <Route path="insights" element={<div>insights page</div>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/journal'))
    expect(screen.queryByText('insights page')).not.toBeInTheDocument()
  })
})

describe('Private mode: the entry editor', () => {
  it('removes the Index and Start Session buttons and restores them when switched off', () => {
    /**
     * The editor is the one screen that stays in private mode, so its own AI
     * affordances must go: the indexed status, the Index button and the
     * Start Session button that hands the entry to chat. The writing tools
     * (word count, text size) stay.
     *
     * Input: open a new entry with private mode on; then switch it off.
     * Expected: no Start Session, Index or "Not indexed" first; all three
     * present afterwards; "0 words" visible throughout.
     */
    useSettingsStore.setState({ privateMode: true })
    render(
      <MemoryRouter initialEntries={['/journal/new']}>
        <Routes>
          <Route path="/journal/new" element={<EntryEditor />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('0 words')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /index/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Not indexed')).not.toBeInTheDocument()

    act(() => useSettingsStore.setState({ privateMode: false }))

    expect(screen.getByText('0 words')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /index/i })).toBeInTheDocument()
    expect(screen.getByText('Not indexed')).toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react'

/**
 * The launcher drives the filesystem and the journal-switch pipeline. We mock
 * those service boundaries so each test exercises the component's flow logic
 * against controllable outcomes, without a Tauri runtime:
 *   - services/fs: pretend we're on desktop; a passthrough slugify; mock the
 *     directory picker, scope grant, existence check, and folder creation.
 *   - services/journalSwitch: the heavy "clear + reload everything" switch.
 * The settings store is the REAL store so we can assert that recents update.
 *
 * vi.hoisted is required because vi.mock factories run before top-level consts.
 */
const { pickDirMock, grantScopeMock, switchJournalMock, existsMock, createFolderMock } = vi.hoisted(() => ({
  pickDirMock: vi.fn(),
  grantScopeMock: vi.fn(async () => {}),
  switchJournalMock: vi.fn(async () => ({ added: 0, profileLoaded: false, contextNotes: 0 })),
  existsMock: vi.fn(),
  createFolderMock: vi.fn(async () => {}),
}))

vi.mock('../../services/fs', () => ({
  hasFileSystem: () => true,
  slugify: (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  pickJournalDirectory: pickDirMock,
  grantFsScope: grantScopeMock,
  journalPathExists: existsMock,
  createJournalFolder: createFolderMock,
}))
vi.mock('../../services/journalSwitch', () => ({ switchJournal: switchJournalMock }))

import { JournalLauncher } from '../../components/launcher/JournalLauncher'
import { useSettingsStore } from '../../stores/settingsStore'

beforeEach(() => {
  useSettingsStore.setState({ recentJournals: [], journalPath: '', theme: 'system' })
  pickDirMock.mockReset()
  grantScopeMock.mockClear()
  switchJournalMock.mockClear()
  existsMock.mockReset()
  createFolderMock.mockClear()
})

afterEach(() => cleanup())

describe('JournalLauncher', () => {
  it('shows the welcome / create state on a fresh install with no recents', () => {
    /**
     * A brand-new install has no recents. The launcher must read as onboarding
     * — a welcome heading and a clear "create your first journal" action —
     * rather than an empty switcher with nothing to switch to.
     */
    render(<JournalLauncher onChosen={vi.fn()} />)

    expect(screen.getByText('Welcome to nopy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create new journal/i })).toBeInTheDocument()
    // It is NOT the returning-user "Open a journal" state.
    expect(screen.queryByText('Open a journal')).not.toBeInTheDocument()
  })

  it('creates a new journal end-to-end (name → location → create) and switches into it', async () => {
    /**
     * The core happy path for a new journal: name it, pick where it lives, see
     * the exact folder that will be created, then create. The folder must be
     * made under the chosen parent with the slugified name, the app must switch
     * into it, and the launcher must close (onChosen).
     */
    existsMock.mockResolvedValue(false) // target folder doesn't exist yet
    pickDirMock.mockResolvedValue('/home/me/journals')
    const onChosen = vi.fn()
    render(<JournalLauncher onChosen={onChosen} />)

    fireEvent.click(screen.getByRole('button', { name: /create new journal/i }))
    fireEvent.change(screen.getByPlaceholderText('e.g. travel-log-2026'), { target: { value: 'My Trip' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /choose folder/i }))

    // Once a location is picked, the final path is previewed before committing.
    await screen.findByText('/home/me/journals/my-trip')
    fireEvent.click(screen.getByRole('button', { name: /create journal/i }))

    await waitFor(() => {
      expect(createFolderMock).toHaveBeenCalledWith('/home/me/journals/my-trip')
      expect(switchJournalMock).toHaveBeenCalledWith('/home/me/journals/my-trip')
      expect(onChosen).toHaveBeenCalledTimes(1)
    })
  })

  it('opens a journal from the recents list and switches into it', async () => {
    /**
     * The returning-user path: a previously-used journal is listed and clicking
     * it switches the whole app into that folder. This is what makes "every
     * launch" one click for someone who keeps using the same journal.
     */
    useSettingsStore.setState({
      recentJournals: [{ path: '/a/work', name: 'work', lastOpenedAt: '2026-01-01T00:00:00.000Z' }],
      journalPath: '/a/work',
    })
    existsMock.mockResolvedValue(true) // folder still exists
    const onChosen = vi.fn()
    render(<JournalLauncher onChosen={onChosen} />)

    // The open button's accessible name includes the path; matching on it avoids
    // colliding with the row's "Remove …" button.
    fireEvent.click(screen.getByRole('button', { name: /\/a\/work/ }))

    await waitFor(() => {
      expect(switchJournalMock).toHaveBeenCalledWith('/a/work')
      expect(onChosen).toHaveBeenCalledTimes(1)
    })
  })

  it('browses to an existing folder: cancelling does nothing, then a pick opens it', async () => {
    /**
     * "Open other folder…" lets the user select any journal folder on disk.
     * Cancelling the native picker must be a no-op (no switch, launcher stays
     * open); picking a folder must open it just like a recent.
     */
    existsMock.mockResolvedValue(true)
    const onChosen = vi.fn()
    render(<JournalLauncher onChosen={onChosen} />)

    // Cancel → picker returns null → nothing happens.
    pickDirMock.mockResolvedValueOnce(null)
    fireEvent.click(screen.getByRole('button', { name: /open other folder/i }))
    await waitFor(() => expect(pickDirMock).toHaveBeenCalledTimes(1))
    expect(switchJournalMock).not.toHaveBeenCalled()
    expect(onChosen).not.toHaveBeenCalled()

    // Pick a folder → it opens.
    pickDirMock.mockResolvedValueOnce('/picked/journal')
    fireEvent.click(screen.getByRole('button', { name: /open other folder/i }))
    await waitFor(() => {
      expect(switchJournalMock).toHaveBeenCalledWith('/picked/journal')
      expect(onChosen).toHaveBeenCalledTimes(1)
    })
  })

  it('flags a recent whose folder is missing and lets the user remove it', async () => {
    /**
     * Journal folders can be moved or deleted out from under the app. A recent
     * whose folder no longer exists must be shown as unavailable (so it can't be
     * opened into a broken state) and be removable from the list.
     */
    useSettingsStore.setState({
      recentJournals: [{ path: '/gone/journal', name: 'journal', lastOpenedAt: '2026-01-01T00:00:00.000Z' }],
      journalPath: '',
    })
    existsMock.mockResolvedValue(false) // folder is gone
    render(<JournalLauncher onChosen={vi.fn()} />)

    // The on-mount existence check flags it.
    await screen.findByText('Folder not found')

    fireEvent.click(screen.getByRole('button', { name: /remove journal from recent journals/i }))
    expect(useSettingsStore.getState().recentJournals).toEqual([])
  })
})

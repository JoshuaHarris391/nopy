import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SYSTEM_PROFILE_ID, SYSTEM_INDEX_ID, type ContextNote, type ContextInjection } from '../../types/context'
import type { JournalEntry } from '../../types/journal'

/**
 * Shared in-memory IndexedDB and per-journal "disk" fixtures. vi.hoisted is
 * required because vi.mock factories are hoisted above the file body — a plain
 * top-level const would not yet be initialised when the factory runs.
 *
 * The disk maps are keyed by journal path: they model the files that live in
 * each journal folder, which is the source of truth a journal switch must end
 * up reflecting.
 */
const { idbStore, diskNotes, diskManifest, diskEntries } = vi.hoisted(() => ({
  idbStore: new Map<string, unknown>(),
  diskNotes: new Map<string, ContextNote[]>(),
  diskManifest: new Map<string, ContextInjection[] | null>(),
  diskEntries: new Map<string, JournalEntry[]>(),
}))

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { idbStore.set(key, value) }),
  del: vi.fn(async (key: string) => { idbStore.delete(key) }),
}))

/**
 * Context disk I/O, keyed by journal path. loadContextNotesFromDisk /
 * loadManifestFromDisk return whatever the test placed "on disk" for the path
 * being loaded, so the store's post-switch state can be checked against it.
 */
vi.mock('../../services/contextPersistence', () => ({
  saveContextNoteToDisk: vi.fn(async (note: ContextNote) => note.sourceFilename ?? 'note.md'),
  deleteContextNoteFromDisk: vi.fn(async () => {}),
  loadContextNotesFromDisk: vi.fn(async (path: string) => diskNotes.get(path) ?? []),
  saveManifestToDisk: vi.fn(async () => {}),
  loadManifestFromDisk: vi.fn(async (path: string) => diskManifest.get(path) ?? null),
}))

/**
 * fs: hasFileSystem() → false short-circuits profileStore.loadProfileFromDisk
 * (no Tauri FS plugin in jsdom). Journal entry disk reads are stubbed per path;
 * grantFsScope is a no-op.
 */
vi.mock('../../services/fs', () => ({
  hasFileSystem: vi.fn(() => false),
  grantFsScope: vi.fn(async () => {}),
  loadEntriesFromDisk: vi.fn(async (path: string) => diskEntries.get(path) ?? []),
  saveEntryToDisk: vi.fn(async () => 'entry.md'),
  deleteEntryFromDisk: vi.fn(async () => {}),
  saveProfileToDisk: vi.fn(async () => {}),
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
  pickJournalDirectory: vi.fn(async () => null),
}))

/** chatPersistence: no debounced writes or on-disk sessions in these tests. */
vi.mock('../../services/chatPersistence', () => ({
  flushChatSave: vi.fn(async () => {}),
  loadChatFromDisk: vi.fn(async () => []),
  scheduleChatSave: vi.fn(),
  saveChatToDisk: vi.fn(async () => {}),
  hydrateEntryContext: vi.fn(async () => null),
}))

import { switchJournal } from '../../services/journalSwitch'
import { useSettingsStore } from '../../stores/settingsStore'
import { useContextStore } from '../../stores/contextStore'
import { useJournalStore } from '../../stores/journalStore'
import { useProfileStore } from '../../stores/profileStore'
import { useChatStore } from '../../stores/chatStore'

const T = '2026-01-01T00:00:00.000Z'

function makeNote(id: string, title: string): ContextNote {
  return { id, title, content: `Body of ${title}`, tags: [], createdAt: T, updatedAt: T, sourceFilename: `${id}.md` }
}

function makeEntry(id: string, title: string): JournalEntry {
  return { id, title, content: `Content of ${title}`, createdAt: T, updatedAt: T, mood: null, tags: [], summary: null, indexed: false }
}

/**
 * Seed the in-memory stores + IndexedDB to mimic "journal A is currently open
 * with one injected context note". This is the state that must NOT survive a
 * switch to a different journal.
 */
function openJournalA() {
  useSettingsStore.setState({ journalPath: '/journal-A' })
  const noteA = makeNote('a1', 'Journal A note')
  const injectionA: ContextInjection[] = [
    { id: SYSTEM_PROFILE_ID, injected: true, order: 0 },
    { id: SYSTEM_INDEX_ID, injected: true, order: 1 },
    { id: 'a1', injected: true, order: 2 },
  ]
  useContextStore.setState({
    notes: [noteA],
    injection: Object.fromEntries(injectionA.map((i) => [i.id, i])),
    loaded: true,
  })
  idbStore.set('nopy-context-notes', [noteA])
  idbStore.set('nopy-context-injection', injectionA)
}

beforeEach(() => {
  idbStore.clear()
  diskNotes.clear()
  diskManifest.clear()
  diskEntries.clear()
  useSettingsStore.setState({ journalPath: '' })
  useContextStore.setState({ notes: [], injection: {}, loaded: false, lastError: null })
  useJournalStore.setState({ entries: [], loaded: false, syncing: false, lastError: null })
  useProfileStore.setState({ profile: null, loaded: false })
  useChatStore.setState({ sessions: [], activeSession: null, activeSessionId: null, loaded: false })
})

describe('switchJournal — context notes follow the folder, not the cache', () => {
  it('replaces the previous journal\'s context notes with the new journal\'s on switch', async () => {
    /**
     * The reported bug: after switching journals, context notes from the
     * previous journal lingered and were injected into the new journal's chat.
     * The root cause was that switchJournal cleared the entry/profile/chat
     * caches but left the context cache (IndexedDB + store) untouched, and
     * loadContext is IDB-first so it never reached the new folder's notes.
     *
     * Input: journal A is open with note "a1" cached; journal B has a
     * different note "b1" on disk. switchJournal('/journal-B').
     * Expected output: the store holds only B's note — A's note and its
     * injection record are gone — and the return value reports 1 context note.
     */
    openJournalA()
    diskNotes.set('/journal-B', [makeNote('b1', 'Journal B note')])

    const result = await switchJournal('/journal-B')

    const notes = useContextStore.getState().notes
    expect(notes.map((n) => n.id)).toEqual(['b1'])
    expect(notes.find((n) => n.id === 'a1')).toBeUndefined()
    // The stale injection entry for A's note must not leak into B either.
    expect(useContextStore.getState().injection.a1).toBeUndefined()
    expect(result.contextNotes).toBe(1)
    // IndexedDB (the downstream cache) now mirrors the new folder, not A.
    expect(idbStore.get('nopy-context-notes')).toEqual([makeNote('b1', 'Journal B note')])
  })

  it('starts a freshly created empty journal with no notes and the default injection seed', async () => {
    /**
     * Creating a new (empty) journal folder and switching into it must give a
     * clean slate: no inherited notes, and the back-compat default injection
     * (profile at order 0, index at order 1) that a user who never opens the
     * Context workspace relies on.
     *
     * Input: journal A is open with note "a1" cached; the new journal folder
     * has no context files (disk returns [] notes, null manifest).
     * Expected output: zero notes, and the default profile+index seed.
     */
    openJournalA()
    // No diskNotes / diskManifest entry for the new path → empty folder.

    const result = await switchJournal('/journal-B-empty')

    expect(useContextStore.getState().notes).toEqual([])
    expect(result.contextNotes).toBe(0)
    const inj = useContextStore.getState().injection
    expect(inj[SYSTEM_PROFILE_ID]).toEqual({ id: SYSTEM_PROFILE_ID, injected: true, order: 0 })
    expect(inj[SYSTEM_INDEX_ID]).toEqual({ id: SYSTEM_INDEX_ID, injected: true, order: 1 })
    expect(inj.a1).toBeUndefined()
  })

  it('also reloads journal entries from the new folder (no cross-store regression)', async () => {
    /**
     * The context fix sits alongside the existing entry/profile/chat reloads in
     * one orchestration function. This guards that wiring context in did not
     * regress the sibling stores: entries must still come from the new folder's
     * disk and the result must report what was synced.
     *
     * Input: journal A open with entry "ea" cached; journal B has entry "eb"
     * on disk; no profile on disk. switchJournal('/journal-B').
     * Expected output: the entry store holds only B's entry, added=1, and
     * profileLoaded=false.
     */
    useJournalStore.setState({ entries: [makeEntry('ea', 'Entry A')], loaded: true })
    diskEntries.set('/journal-B', [makeEntry('eb', 'Entry B')])

    const result = await switchJournal('/journal-B')

    expect(useJournalStore.getState().entries.map((e) => e.id)).toEqual(['eb'])
    expect(result.added).toBe(1)
    expect(result.profileLoaded).toBe(false)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SYSTEM_PROFILE_ID, SYSTEM_INDEX_ID, type ContextNote } from '../../types/context'

/**
 * In-memory mock of idb-keyval — the context store round-trips notes and the
 * injection map through `nopy-context-notes` / `nopy-context-injection`. A Map
 * is enough to assert behaviour without jsdom's missing IndexedDB.
 */
const idbStore = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { idbStore.set(key, value) }),
  del: vi.fn(async (key: string) => { idbStore.delete(key) }),
}))

/**
 * Mock disk persistence so the store never reaches for Tauri's FS plugin in
 * jsdom. loadManifest returns null (no manifest) so loadContext exercises the
 * default-seed path; loadNotes returns [].
 */
vi.mock('../../services/contextPersistence', () => ({
  saveContextNoteToDisk: vi.fn(async (note: ContextNote) => note.sourceFilename ?? 'note.md'),
  deleteContextNoteFromDisk: vi.fn(async () => {}),
  loadContextNotesFromDisk: vi.fn(async () => []),
  saveManifestToDisk: vi.fn(async () => {}),
  loadManifestFromDisk: vi.fn(async () => null),
}))

import { useContextStore } from '../../stores/contextStore'
import { useSettingsStore } from '../../stores/settingsStore'

function makeNote(overrides: Partial<ContextNote> = {}): ContextNote {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), title: 'Note', content: 'Body', tags: [], createdAt: now, updatedAt: now, ...overrides }
}

beforeEach(() => {
  idbStore.clear()
  useSettingsStore.setState({ journalPath: '' })
  useContextStore.setState({ notes: [], injection: {}, loaded: false, lastError: null })
})

describe('useContextStore', () => {
  it('seeds the default injection (profile + index, in order) on first load', () => {
    /**
     * With no persisted manifest, loadContext must reproduce the pre-workspace
     * behaviour: profile injected at order 0, index at order 1. This is the
     * back-compat guarantee — a user who never opens the workspace keeps the
     * old chat context.
     * Input: empty IDB, no manifest
     * Expected output: both system items injected with orders 0 and 1
     */
    return useContextStore.getState().loadContext().then(() => {
      const inj = useContextStore.getState().injection
      expect(inj[SYSTEM_PROFILE_ID]).toEqual({ id: SYSTEM_PROFILE_ID, injected: true, order: 0 })
      expect(inj[SYSTEM_INDEX_ID]).toEqual({ id: SYSTEM_INDEX_ID, injected: true, order: 1 })
    })
  })

  it('appends a newly injected item to the end of the shelf order', async () => {
    /**
     * Toggling an item on places it last on the shelf (highest order) so it
     * doesn't jump ahead of the user's existing arrangement.
     * Input: default seed (orders 0,1), then inject note "n9"
     * Expected output: n9 injected at order 2
     */
    await useContextStore.getState().loadContext()
    await useContextStore.getState().setInjected('n9', true)
    const inj = useContextStore.getState().injection
    expect(inj.n9).toEqual({ id: 'n9', injected: true, order: 2 })
  })

  it('preserves an item\'s order when toggled off', async () => {
    /**
     * Turning an item off must keep its order so re-enabling it later restores
     * its position rather than sending it to the back.
     * Input: default seed, toggle index off
     * Expected output: index injected=false but order still 1
     */
    await useContextStore.getState().loadContext()
    await useContextStore.getState().setInjected(SYSTEM_INDEX_ID, false)
    const inj = useContextStore.getState().injection
    expect(inj[SYSTEM_INDEX_ID]).toEqual({ id: SYSTEM_INDEX_ID, injected: false, order: 1 })
  })

  it('reorders injected items when moved along the shelf', async () => {
    /**
     * Moving the profile to the right swaps it with the index, and the orders
     * are renumbered sequentially from 0.
     * Input: default seed (profile 0, index 1), move profile right
     * Expected output: index order 0, profile order 1
     */
    await useContextStore.getState().loadContext()
    await useContextStore.getState().moveInjected(SYSTEM_PROFILE_ID, 'right')
    const inj = useContextStore.getState().injection
    expect(inj[SYSTEM_INDEX_ID].order).toBe(0)
    expect(inj[SYSTEM_PROFILE_ID].order).toBe(1)
  })

  it('removes a note and its injection entry on delete', async () => {
    /**
     * Deleting a note must also drop its injection record, otherwise a stale
     * entry would linger in the manifest pointing at a note that no longer
     * exists.
     * Input: add note, inject it, then delete it
     * Expected output: note gone from notes; no injection entry for its id
     */
    await useContextStore.getState().loadContext()
    const note = makeNote({ id: 'n1' })
    await useContextStore.getState().addNote(note)
    await useContextStore.getState().setInjected('n1', true)
    expect(useContextStore.getState().injection.n1).toBeDefined()

    await useContextStore.getState().deleteNote('n1')
    expect(useContextStore.getState().notes.find((n) => n.id === 'n1')).toBeUndefined()
    expect(useContextStore.getState().injection.n1).toBeUndefined()
  })
})

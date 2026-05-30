import { create } from 'zustand'
import { get, set, del } from 'idb-keyval'
import {
  SYSTEM_PROFILE_ID,
  SYSTEM_INDEX_ID,
  type ContextNote,
  type ContextInjection,
} from '../types/context'
import {
  saveContextNoteToDisk,
  deleteContextNoteFromDisk,
  loadContextNotesFromDisk,
  saveManifestToDisk,
  loadManifestFromDisk,
} from '../services/contextPersistence'
import { useSettingsStore } from './settingsStore'

const NOTES_KEY = 'nopy-context-notes'
const INJECTION_KEY = 'nopy-context-injection'

type InjectionMap = Record<string, ContextInjection>

/**
 * Default injection seed (first run, no manifest): profile + index injected,
 * in that order. This reproduces the pre-workspace chat behaviour exactly, so
 * a user who never opens the Context view sees no change.
 */
function defaultInjection(): InjectionMap {
  return {
    [SYSTEM_PROFILE_ID]: { id: SYSTEM_PROFILE_ID, injected: true, order: 0 },
    [SYSTEM_INDEX_ID]: { id: SYSTEM_INDEX_ID, injected: true, order: 1 },
  }
}

function toMap(arr: ContextInjection[]): InjectionMap {
  return Object.fromEntries(arr.map((i) => [i.id, i]))
}

function nextOrder(injection: InjectionMap): number {
  const orders = Object.values(injection).filter((i) => i.injected).map((i) => i.order)
  return orders.length > 0 ? Math.max(...orders) + 1 : 0
}

function getJournalPath(): string {
  return useSettingsStore.getState().journalPath
}

interface ContextState {
  notes: ContextNote[]
  injection: InjectionMap
  loaded: boolean
  lastError: string | null

  clearLastError: () => void
  loadContext: () => Promise<void>
  addNote: (note: ContextNote) => Promise<void>
  updateNote: (id: string, updates: Partial<ContextNote>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  setInjected: (id: string, injected: boolean) => Promise<void>
  moveInjected: (id: string, direction: 'left' | 'right') => Promise<void>
  clear: () => Promise<void>
}

export const useContextStore = create<ContextState>()((setState, getState) => ({
  notes: [],
  injection: {},
  loaded: false,
  lastError: null,

  clearLastError: () => setState({ lastError: null }),

  loadContext: async () => {
    const [idbNotes, idbInjection] = await Promise.all([
      get<ContextNote[]>(NOTES_KEY),
      get<ContextInjection[]>(INJECTION_KEY),
    ])

    let notes = idbNotes ?? null
    let injectionArr = idbInjection ?? null

    // IDB empty → try disk.
    const journalPath = getJournalPath()
    if (notes === null && journalPath) {
      const disk = await loadContextNotesFromDisk(journalPath)
      if (disk.length > 0) {
        notes = disk
        await set(NOTES_KEY, disk)
      }
    }
    if (injectionArr === null && journalPath) {
      injectionArr = await loadManifestFromDisk(journalPath)
      if (injectionArr) await set(INJECTION_KEY, injectionArr)
    }

    const injection = injectionArr ? toMap(injectionArr) : defaultInjection()
    if (!injectionArr) {
      // Persist the seed so the user's first toggle starts from a stable base.
      await set(INJECTION_KEY, Object.values(injection))
      await saveManifestToDisk(Object.values(injection), journalPath)
    }

    setState({ notes: notes ?? [], injection, loaded: true })
    console.log('[contextStore] loadContext: notes', notes?.length ?? 0, '| injection keys', Object.keys(injection).length)
  },

  addNote: async (note) => {
    const notes = [note, ...getState().notes.filter((n) => n.id !== note.id)]
    setState({ notes, lastError: null })
    await set(NOTES_KEY, notes)
    try {
      const filename = await saveContextNoteToDisk(note, getJournalPath())
      if (filename !== note.sourceFilename) {
        const updated = getState().notes.map((n) => (n.id === note.id ? { ...n, sourceFilename: filename } : n))
        setState({ notes: updated })
        await set(NOTES_KEY, updated)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ lastError: `Failed to save "${note.title}" to disk: ${msg}` })
      throw e
    }
  },

  updateNote: async (id, updates) => {
    const old = getState().notes.find((n) => n.id === id)
    const oldFilename = old?.sourceFilename
    const notes = getState().notes.map((n) =>
      n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n,
    )
    setState({ notes, lastError: null })
    await set(NOTES_KEY, notes)
    const updated = notes.find((n) => n.id === id)
    if (!updated) return
    try {
      const filename = await saveContextNoteToDisk(updated, getJournalPath(), oldFilename)
      if (filename !== updated.sourceFilename) {
        const refreshed = getState().notes.map((n) => (n.id === id ? { ...n, sourceFilename: filename } : n))
        setState({ notes: refreshed })
        await set(NOTES_KEY, refreshed)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ lastError: `Failed to save "${updated.title}" to disk: ${msg}` })
      throw e
    }
  },

  deleteNote: async (id) => {
    const note = getState().notes.find((n) => n.id === id)
    const notes = getState().notes.filter((n) => n.id !== id)
    // Drop its injection entry too.
    const injection = { ...getState().injection }
    delete injection[id]
    setState({ notes, injection, lastError: null })
    await set(NOTES_KEY, notes)
    await set(INJECTION_KEY, Object.values(injection))
    try {
      await deleteContextNoteFromDisk(note?.sourceFilename, getJournalPath())
      await saveManifestToDisk(Object.values(injection), getJournalPath())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ lastError: `Failed to delete note from disk: ${msg}` })
      throw e
    }
  },

  setInjected: async (id, injected) => {
    const current = getState().injection
    const existing = current[id]
    const next: ContextInjection = injected
      ? { id, injected: true, order: existing?.injected ? existing.order : nextOrder(current) }
      : { id, injected: false, order: existing?.order ?? Number.MAX_SAFE_INTEGER }
    const injection = { ...current, [id]: next }
    setState({ injection })
    await set(INJECTION_KEY, Object.values(injection))
    await saveManifestToDisk(Object.values(injection), getJournalPath())
  },

  moveInjected: async (id, direction) => {
    const current = getState().injection
    const ordered = Object.values(current)
      .filter((i) => i.injected)
      .sort((a, b) => a.order - b.order)
    const idx = ordered.findIndex((i) => i.id === id)
    if (idx === -1) return
    const swapWith = direction === 'left' ? idx - 1 : idx + 1
    if (swapWith < 0 || swapWith >= ordered.length) return

    const reordered = [...ordered]
    ;[reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]]

    const injection = { ...current }
    reordered.forEach((item, i) => {
      injection[item.id] = { ...item, order: i }
    })
    setState({ injection })
    await set(INJECTION_KEY, Object.values(injection))
    await saveManifestToDisk(Object.values(injection), getJournalPath())
  },

  clear: async () => {
    setState({ notes: [], injection: {}, loaded: false })
    await del(NOTES_KEY)
    await del(INJECTION_KEY)
  },
}))

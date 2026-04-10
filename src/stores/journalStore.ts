import { create } from 'zustand'
import { get, set } from 'idb-keyval'
import type { JournalEntry } from '../types/journal'
import { saveEntryToDisk, deleteEntryFromDisk, loadEntriesFromDisk } from '../services/fs'
import { processAllEntries } from '../services/entryProcessor'
import { useSettingsStore } from './settingsStore'

function getJournalPath(): string {
  return useSettingsStore.getState().journalPath
}

interface JournalState {
  entries: JournalEntry[]
  loaded: boolean
  syncing: boolean
  lastError: string | null
  forceProcessing: boolean
  forceProgress: { current: number; total: number; title: string }
  forceResult: string | null
  forceAbortController: AbortController | null
  clearLastError: () => void
  loadEntries: () => Promise<void>
  addEntry: (entry: JournalEntry) => Promise<void>
  updateEntry: (id: string, updates: Partial<JournalEntry>) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  syncFromDisk: () => Promise<{ added: number; updated: number; removed: number }>
  processEntries: (apiKey: string, force: boolean, onProgress: (current: number, total: number, title: string) => void, signal?: AbortSignal) => Promise<number>
  startForceUpdate: (apiKey: string) => Promise<void>
  stopForceUpdate: () => void
}

export const useJournalStore = create<JournalState>()((setState, getState) => ({
  entries: [],
  loaded: false,
  syncing: false,
  lastError: null,
  forceProcessing: false,
  forceProgress: { current: 0, total: 0, title: '' },
  forceResult: null,
  forceAbortController: null,

  clearLastError: () => setState({ lastError: null }),

  loadEntries: async () => {
    const entries = await get<JournalEntry[]>('nopy-entries')
    setState({ entries: entries ?? [], loaded: true })
  },

  addEntry: async (entry) => {
    console.log('[journalStore] addEntry: id', entry.id, '| content', entry.content.length, 'chars')
    const entries = [entry, ...getState().entries]
    setState({ entries, lastError: null })
    await set('nopy-entries', entries)
    try {
      await saveEntryToDisk(entry, getJournalPath())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ lastError: `Failed to save "${entry.title}" to disk: ${msg}` })
      throw e
    }
  },

  updateEntry: async (id, updates) => {
    console.log('[journalStore] updateEntry: id', id, '| updating keys', Object.keys(updates).join(', '))
    const entries = getState().entries.map((e) =>
      e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
    )
    setState({ entries, lastError: null })
    await set('nopy-entries', entries)
    const updated = entries.find((e) => e.id === id)
    if (!updated) return
    try {
      await saveEntryToDisk(updated, getJournalPath())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ lastError: `Failed to save "${updated.title}" to disk: ${msg}` })
      throw e
    }
  },

  deleteEntry: async (id) => {
    console.log('[journalStore] deleteEntry: id', id)
    const entry = getState().entries.find((e) => e.id === id)
    const entries = getState().entries.filter((e) => e.id !== id)
    setState({ entries, lastError: null })
    await set('nopy-entries', entries)
    try {
      await deleteEntryFromDisk(id, getJournalPath(), entry?.sourceFilename)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ lastError: `Failed to delete entry from disk: ${msg}` })
      throw e
    }
  },

  syncFromDisk: async () => {
    const journalPath = getJournalPath()
    console.log('[sync] syncFromDisk called with journalPath:', journalPath)
    if (!journalPath) return { added: 0, updated: 0, removed: 0 }

    setState({ syncing: true })
    try {
      const diskEntries = await loadEntriesFromDisk(journalPath)
      const existing = getState().entries

      // Index disk entries by ID and title
      const diskById = new Map(diskEntries.map((e) => [e.id, e]))
      const diskByTitle = new Map(diskEntries.map((e) => [e.title.toLowerCase(), e]))

      // Index existing entries by ID
      const existingById = new Map(existing.map((e) => [e.id, e]))

      let added = 0
      let updated = 0
      let removed = 0
      const result: JournalEntry[] = []

      // 1. Process disk entries: add new, update changed
      for (const diskEntry of diskEntries) {
        const match = existingById.get(diskEntry.id)
        if (match) {
          // Exists in both — disk wins on tie or if newer
          if (new Date(diskEntry.updatedAt) >= new Date(match.updatedAt)) {
            if (diskEntry.content !== match.content || diskEntry.title !== match.title) {
              updated++
            }
            result.push(diskEntry)
          } else {
            result.push(match)
          }
        } else {
          // New on disk — add
          result.push(diskEntry)
          added++
        }
      }

      // 2. Remove entries that are in IndexedDB but not on disk
      for (const entry of existing) {
        const onDisk = diskById.has(entry.id) || diskByTitle.has(entry.title.toLowerCase())
        if (!onDisk) {
          removed++
          // Don't add to result — it's gone
        }
      }

      // Sort by createdAt descending
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      setState({ entries: result })
      await set('nopy-entries', result)

      // Write back any new entries that lacked frontmatter (so they get IDs for future syncs)
      for (const diskEntry of diskEntries) {
        if (!existingById.has(diskEntry.id)) {
          await saveEntryToDisk(diskEntry, journalPath)
        }
      }

      console.log(`[sync] Complete: ${added} added, ${updated} updated, ${removed} removed`)
      return { added, updated, removed }
    } finally {
      setState({ syncing: false })
    }
  },

  processEntries: async (apiKey, force, onProgress, signal) => {
    console.log('[process] processEntries called with journalPath:', getJournalPath(), 'entries:', getState().entries.length)
    const { entries } = getState()
    const results = await processAllEntries(entries, apiKey, force, onProgress, signal)

    if (results.size === 0) return 0

    // Batch update all entries in state
    const now = new Date().toISOString()
    const updated = entries.map((e) => {
      const meta = results.get(e.id)
      if (!meta) return e
      return { ...e, mood: e.mood ?? meta.mood, tags: meta.tags, summary: meta.summary, indexed: true, updatedAt: now }
    })

    setState({ entries: updated })
    await set('nopy-entries', updated)

    // Save each processed entry to disk
    const journalPath = getJournalPath()
    for (const [id] of results) {
      const entry = updated.find((e) => e.id === id)
      if (entry) await saveEntryToDisk(entry, journalPath)
    }

    return results.size
  },

  startForceUpdate: async (apiKey) => {
    if (getState().forceProcessing) {
      getState().stopForceUpdate()
      return
    }
    const controller = new AbortController()
    setState({ forceProcessing: true, forceResult: null, forceProgress: { current: 0, total: 0, title: '' }, forceAbortController: controller })
    try {
      const count = await getState().processEntries(apiKey, true, (current, total, title) => {
        setState({ forceProgress: { current, total, title } })
      }, controller.signal)
      if (!controller.signal.aborted) {
        setState({ forceResult: `Done — ${count} entries reprocessed` })
        setTimeout(() => setState({ forceResult: null }), 3000)
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setState({ forceResult: 'Reprocessing stopped' })
      } else {
        setState({ forceResult: 'Reprocessing failed' })
      }
      setTimeout(() => setState({ forceResult: null }), 3000)
    } finally {
      setState({ forceProcessing: false, forceAbortController: null })
    }
  },

  stopForceUpdate: () => {
    getState().forceAbortController?.abort()
  },
}))

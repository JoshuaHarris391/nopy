import { create } from 'zustand'
import { get, set, del } from 'idb-keyval'
import type { JournalEntry } from '../types/journal'
import { saveEntryToDisk, deleteEntryFromDisk, loadEntriesFromDisk } from '../services/fs'
import {
  processAllEntries, processEntry,
  type ProcessedEntry, type IndexRunMode, type IndexProgress, type IndexRunSummary,
} from '../services/entryProcessor'
import { buildIndexHints, isWriterRated } from '../services/entryRecords'
import { CURRENT_INDEX_VERSION } from '../schemas/journal'
import { useSettingsStore } from './settingsStore'
import { saveToDiskAndReconcileFilename } from './diskSync'
import type { LlmConfig } from '../types/settings'

function getJournalPath(): string {
  return useSettingsStore.getState().journalPath
}

function entryChanged(a: JournalEntry, b: JournalEntry): boolean {
  return (
    a.content !== b.content ||
    a.title !== b.title ||
    a.summary !== b.summary ||
    a.indexed !== b.indexed ||
    JSON.stringify(a.tags) !== JSON.stringify(b.tags) ||
    JSON.stringify(a.mood) !== JSON.stringify(b.mood) ||
    (a.moodSource ?? null) !== (b.moodSource ?? null) ||
    (a.indexVersion ?? 0) !== (b.indexVersion ?? 0) ||
    JSON.stringify(a.insight ?? null) !== JSON.stringify(b.insight ?? null)
  )
}

interface JournalState {
  entries: JournalEntry[]
  loaded: boolean
  syncing: boolean
  lastError: string | null
  clearLastError: () => void
  loadEntries: () => Promise<void>
  addEntry: (entry: JournalEntry) => Promise<void>
  updateEntry: (id: string, updates: Partial<JournalEntry>) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  syncFromDisk: () => Promise<{ added: number; updated: number; removed: number }>
  /** Resolves with the entries whose markdown file could not be written (id → reason). */
  applyProcessedMetadata: (results: Map<string, ProcessedEntry>) => Promise<Record<string, string>>
  /**
   * Index the entries `mode` selects, saving each record as it comes back.
   * `within` limits the run to a subset (profile generation indexes only the
   * entries in its scope); by default it runs over the whole journal.
   */
  processEntries: (config: LlmConfig, mode: IndexRunMode, onProgress: IndexProgress, signal?: AbortSignal, within?: JournalEntry[]) => Promise<IndexRunSummary>
  reindexEntry: (id: string, config: LlmConfig, signal?: AbortSignal) => Promise<void>
  clear: () => Promise<void>
}

export const useJournalStore = create<JournalState>()((setState, getState) => ({
  entries: [],
  loaded: false,
  syncing: false,
  lastError: null,

  clearLastError: () => setState({ lastError: null }),

  loadEntries: async () => {
    const entries = await get<JournalEntry[]>('nopy-entries')
    setState({ entries: entries ?? [], loaded: true })
  },

  addEntry: async (entry) => {
    console.log('[journalStore] addEntry: id', entry.id, '| content', entry.content.length, 'chars')
    const entries = [entry, ...getState().entries.filter((e) => e.id !== entry.id)]
    setState({ entries, lastError: null })
    await set('nopy-entries', entries)
    await saveToDiskAndReconcileFilename({
      item: entry,
      journalPath: getJournalPath(),
      saveToDisk: saveEntryToDisk,
      idbKey: 'nopy-entries',
      getItems: () => getState().entries,
      setItems: (items) => setState({ entries: items }),
      setLastError: (message) => setState({ lastError: message }),
    })
  },

  updateEntry: async (id, updates) => {
    console.log('[journalStore] updateEntry: id', id, '| updating keys', Object.keys(updates).join(', '))
    const oldEntry = getState().entries.find((e) => e.id === id)
    const oldSourceFilename = oldEntry?.sourceFilename
    const entries = getState().entries.map((e) =>
      e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
    )
    setState({ entries, lastError: null })
    await set('nopy-entries', entries)
    const updated = entries.find((e) => e.id === id)
    if (!updated) return
    await saveToDiskAndReconcileFilename({
      item: updated,
      oldFilename: oldSourceFilename,
      journalPath: getJournalPath(),
      saveToDisk: saveEntryToDisk,
      idbKey: 'nopy-entries',
      getItems: () => getState().entries,
      setItems: (items) => setState({ entries: items }),
      setLastError: (message) => setState({ lastError: message }),
    })
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
      const loadedFromDisk = await loadEntriesFromDisk(journalPath)
      // Two files carrying the same frontmatter id (a copied file, or a rename
      // whose old file was never removed) would otherwise both load and show
      // as duplicate entries that re-index can never reconcile. Keep the most
      // recently updated file per id, skip the rest, and say which files clash
      // so the writer can delete or rename one.
      const seen = new Map<string, JournalEntry>()
      const clashes = new Map<string, string[]>()
      for (const e of loadedFromDisk) {
        const prev = seen.get(e.id)
        if (!prev) { seen.set(e.id, e); continue }
        const keep = e.updatedAt > prev.updatedAt ? e : prev
        const drop = keep === e ? prev : e
        seen.set(e.id, keep)
        clashes.set(e.id, [...(clashes.get(e.id) ?? [prev.sourceFilename ?? '?']), e.sourceFilename ?? '?'])
        console.warn('[sync] Two files share entry id', e.id, '— using', keep.sourceFilename, 'and ignoring', drop.sourceFilename)
      }
      const diskEntries = [...seen.values()]
      if (clashes.size > 0) {
        const list = [...clashes.values()].map((files) => files.join(' and ')).join('; ')
        setState({ lastError: `Duplicate entry files found (same id): ${list}. Delete or rename the copy you don't want; only the newest is shown.` })
      }
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
          if (entryChanged(diskEntry, match)) {
            result.push(diskEntry)
            updated++
          } else {
            // Same entry, but the file may have been renamed outside the app:
            // the name on disk is the one every later save must target.
            result.push(match.sourceFilename === diskEntry.sourceFilename ? match : { ...match, sourceFilename: diskEntry.sourceFilename })
          }
        } else {
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
      const renamed = new Map<string, string>()
      for (const diskEntry of diskEntries) {
        if (!existingById.has(diskEntry.id) && !clashes.has(diskEntry.id)) {
          try {
            // The write-back names the file after the entry's title, which
            // renames an import like "My Day.md" to "my-day.md".
            const filename = await saveEntryToDisk(diskEntry, journalPath, diskEntry.sourceFilename)
            if (filename !== diskEntry.sourceFilename) renamed.set(diskEntry.id, filename)
          } catch (e) {
            // Two disk files can slugify to the same name (e.g. duplicate plain
            // imports). Skip the colliding write-back rather than aborting the
            // whole sync — the entry is still loaded into memory.
            console.warn('[sync] Skipped frontmatter write-back for', diskEntry.sourceFilename, e)
          }
        }
      }
      // Track the new names. An entry still pointing at its old filename has
      // its next save (an edit, or an index record) refused as a collision
      // with the file it was just renamed to.
      if (renamed.size > 0) {
        const tracked = getState().entries.map((e) => (renamed.has(e.id) ? { ...e, sourceFilename: renamed.get(e.id) } : e))
        setState({ entries: tracked })
        await set('nopy-entries', tracked)
      }

      console.log(`[sync] Complete: ${added} added, ${updated} updated, ${removed} removed`)
      return { added, updated, removed }
    } finally {
      setState({ syncing: false })
    }
  },

  applyProcessedMetadata: async (results) => {
    const writeErrors: Record<string, string> = {}
    if (results.size === 0) return writeErrors
    const now = new Date().toISOString()
    const entries = getState().entries.map((e) => {
      const meta = results.get(e.id)
      if (!meta) return e
      // The writer's own mood always wins over the indexer's estimate (which
      // is still kept in insight.inferredMood); a mood the indexer set last
      // time is replaced by its fresh estimate. Domains land in `tags`.
      const writerRated = isWriterRated(e)
      return {
        ...e,
        mood: writerRated ? e.mood : meta.mood,
        moodSource: writerRated ? (e.moodSource ?? 'writer') : 'indexer',
        tags: meta.domains,
        summary: meta.summary,
        insight: meta.insight,
        indexed: true,
        indexVersion: CURRENT_INDEX_VERSION,
        indexModel: meta.indexModel,
        updatedAt: now,
      }
    })
    setState({ entries })
    await set('nopy-entries', entries)
    const journalPath = getJournalPath()
    const renamed = new Map<string, string>()
    for (const [id] of results) {
      const entry = entries.find((e) => e.id === id)
      if (!entry) continue
      try {
        const filename = await saveEntryToDisk(entry, journalPath, entry.sourceFilename)
        if (filename !== entry.sourceFilename) renamed.set(id, filename)
      } catch (e) {
        // One entry's failed write must not stop the rest, but it must be
        // seen: the record lives only in the cache until its file is written,
        // and the cache is rebuilt from disk when the journal is reopened.
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[journalStore] Index record not written for', entry.sourceFilename, e)
        writeErrors[id] = msg
        setState({ lastError: `Indexed "${entry.title}" but could not write its file: ${msg}` })
      }
    }
    if (renamed.size > 0) {
      const tracked = getState().entries.map((e) => (renamed.has(e.id) ? { ...e, sourceFilename: renamed.get(e.id) } : e))
      setState({ entries: tracked })
      await set('nopy-entries', tracked)
    }
    return writeErrors
  },

  processEntries: async (config, mode, onProgress, signal, within) => {
    // Private mode: never touch the LLM, even if a UI path slipped through.
    if (useSettingsStore.getState().privateMode) return { attempted: 0, indexed: 0, failed: [] }
    console.log('[process] processEntries called with journalPath:', getJournalPath(), 'entries:', getState().entries.length)
    const entries = within ?? getState().entries
    // Each record is saved (state, IndexedDB, markdown) the moment it comes
    // back, so stopping the run or quitting the app keeps what was done.
    const { attempted, indexed, failed } = await processAllEntries(entries, config, mode, onProgress, signal, {
      onRecord: async (id, record) => {
        const writeErrors = await getState().applyProcessedMetadata(new Map([[id, record]]))
        if (writeErrors[id]) throw new Error(`Indexed, but its file could not be written: ${writeErrors[id]}`)
      },
    })
    return { attempted, indexed, failed }
  },

  reindexEntry: async (id, config, signal) => {
    if (useSettingsStore.getState().privateMode) return
    const entry = getState().entries.find((e) => e.id === id)
    if (!entry) {
      console.warn('[journalStore] reindexEntry: entry not found', id)
      return
    }
    console.log('[journalStore] reindexEntry: id', id, '| content', entry.content.length, 'chars')
    const meta = await processEntry(entry, config, signal, buildIndexHints(getState().entries, entry))
    if (signal?.aborted) return // don't write stale metadata after a cancel
    await getState().applyProcessedMetadata(new Map([[id, meta]]))
  },

  clear: async () => {
    setState({ entries: [], loaded: false })
    await del('nopy-entries')
  },
}))

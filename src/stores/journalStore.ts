import { create } from 'zustand'
import { get, set } from 'idb-keyval'
import type { JournalEntry } from '../types/journal'
import { saveEntryToDisk, deleteEntryFromDisk } from '../services/fs'
import { useSettingsStore } from './settingsStore'

function getJournalPath(): string {
  return useSettingsStore.getState().journalPath
}

interface JournalState {
  entries: JournalEntry[]
  loaded: boolean
  loadEntries: () => Promise<void>
  addEntry: (entry: JournalEntry) => Promise<void>
  updateEntry: (id: string, updates: Partial<JournalEntry>) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
}

export const useJournalStore = create<JournalState>()((setState, getState) => ({
  entries: [],
  loaded: false,

  loadEntries: async () => {
    const entries = await get<JournalEntry[]>('nopy-entries')
    setState({ entries: entries ?? [], loaded: true })
  },

  addEntry: async (entry) => {
    const entries = [entry, ...getState().entries]
    setState({ entries })
    await set('nopy-entries', entries)
    await saveEntryToDisk(entry, getJournalPath())
  },

  updateEntry: async (id, updates) => {
    const entries = getState().entries.map((e) =>
      e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
    )
    setState({ entries })
    await set('nopy-entries', entries)
    const updated = entries.find((e) => e.id === id)
    if (updated) await saveEntryToDisk(updated, getJournalPath())
  },

  deleteEntry: async (id) => {
    const entries = getState().entries.filter((e) => e.id !== id)
    setState({ entries })
    await set('nopy-entries', entries)
    await deleteEntryFromDisk(id, getJournalPath())
  },
}))

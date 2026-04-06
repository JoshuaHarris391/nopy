import { create } from 'zustand'
import { get, set } from 'idb-keyval'
import type { JournalEntry } from '../types/journal'

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
  },

  updateEntry: async (id, updates) => {
    const entries = getState().entries.map((e) =>
      e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
    )
    setState({ entries })
    await set('nopy-entries', entries)
  },

  deleteEntry: async (id) => {
    const entries = getState().entries.filter((e) => e.id !== id)
    setState({ entries })
    await set('nopy-entries', entries)
  },
}))

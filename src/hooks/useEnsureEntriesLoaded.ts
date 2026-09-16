import { useEffect } from 'react'
import { useJournalStore } from '../stores/journalStore'

/** Kick off the one-time IndexedDB load of journal entries if it hasn't happened yet. */
export function useEnsureEntriesLoaded(): boolean {
  const loaded = useJournalStore((s) => s.loaded)
  const loadEntries = useJournalStore((s) => s.loadEntries)
  useEffect(() => {
    if (!loaded) loadEntries()
  }, [loaded, loadEntries])
  return loaded
}

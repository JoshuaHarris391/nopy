import { useJournalStore } from '../stores/journalStore'
import { getJournalIndex, type JournalIndex } from '../services/journalBooks'

/**
 * The sorted/bucketed view of the journal. `getJournalIndex` is memoised per
 * entries-array identity, so the selector returns the same object until the
 * store actually mutates — no useShallow needed and no render loops.
 */
export function useJournalIndex(): JournalIndex {
  return useJournalStore((s) => getJournalIndex(s.entries))
}

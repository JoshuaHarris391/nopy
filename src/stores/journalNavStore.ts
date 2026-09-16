import { create } from 'zustand'
import type { MonthRef } from '../services/journalBooks'

/**
 * Session-only memory of where the reader was in the journal, so that opening
 * an entry and coming back does not reset the month scroll to the top.
 *
 * Deliberately not persisted: a scroll offset means nothing after a restart
 * (window size, new entries) and the Journal tab always lands on the current
 * month. Components write to it from effects and handlers via getState();
 * nothing subscribes to `scrollTop`, so scroll-time writes never re-render.
 */
interface JournalNavState {
  /** The month scroll most recently viewed. */
  lastMonth: MonthRef | null
  /** Its scroll offset. */
  scrollTop: number
  /** Set by the editor on Close; consumed once by the next MonthScroll mount. */
  revealEntryId: string | null
  rememberScroll: (month: MonthRef, scrollTop: number) => void
  setRevealEntry: (id: string | null) => void
  clear: () => void
}

export const useJournalNavStore = create<JournalNavState>()((set) => ({
  lastMonth: null,
  scrollTop: 0,
  revealEntryId: null,
  rememberScroll: (month, scrollTop) => set({ lastMonth: month, scrollTop }),
  setRevealEntry: (id) => set({ revealEntryId: id }),
  clear: () => set({ lastMonth: null, scrollTop: 0, revealEntryId: null }),
}))

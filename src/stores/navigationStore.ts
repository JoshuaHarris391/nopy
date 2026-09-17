import { create } from 'zustand'
import type { NavigationType } from 'react-router-dom'
import { usePageMemoryStore } from './pageMemoryStore'

/**
 * Session-only mirror of the router's history, so the UI can tell whether
 * history Back stays inside the app and which page it lands on. The router
 * itself is the back stack: this store never navigates, it only watches
 * (see src/app/HistoryMirror.tsx) and answers "can I go back, and to what?".
 *
 * `root` marks a page the reader chose from the Sidebar or BottomNav, or the
 * page the session started on. A root page never shows a back arrow: the
 * rail is its way home. Pages reached from inside content (a row, a card, a
 * cover, a link) are not roots and do.
 */
export interface HistoryEntry {
  key: string
  pathname: string
  root: boolean
}

export interface NavigationState {
  entries: HistoryEntry[]
  /** Position of the current page in `entries`; -1 before the first sync. */
  index: number
  sync: (location: MirroredLocation, type: `${NavigationType}`) => void
  /** Forget every other page but keep the one the reader is standing on, as a root. */
  clear: () => void
}

export interface MirroredLocation {
  key: string
  pathname: string
  state: unknown
}

/** Sidebar and BottomNav links navigate with this so their pushes count as roots. */
export const ROOT_STATE = { root: true } as const

function isRootState(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { root?: unknown }).root === true
}

export const useNavigationStore = create<NavigationState>()((set, get) => ({
  entries: [],
  index: -1,
  sync: (location, type) => {
    const { entries, index } = get()
    // StrictMode runs effects twice; the second call is a no-op.
    if (entries[index]?.key === location.key) return
    const forget = usePageMemoryStore.getState().forget
    const cur: HistoryEntry = { key: location.key, pathname: location.pathname, root: isRootState(location.state) }

    if (index < 0 || type === 'POP') {
      const i = entries.findIndex((e) => e.key === location.key)
      if (i >= 0) {
        set({ index: i })
        return
      }
      // First mount, or a history entry we never saw (reload, HMR): the
      // reader is standing at a root with nothing behind it.
      set({ entries: [{ ...cur, root: true }], index: 0 })
      return
    }

    if (type === 'REPLACE') {
      // A redirect keeps the intent of the page it replaces: /journal chosen
      // from the rail resolves to a month that is still a root.
      const old = entries[index]
      const next = entries.slice()
      next[index] = { ...cur, root: cur.root || old.root }
      set({ entries: next })
      forget([old.key])
      return
    }

    const dropped = entries.slice(index + 1)
    set({ entries: [...entries.slice(0, index + 1), cur], index: index + 1 })
    if (dropped.length > 0) forget(dropped.map((e) => e.key))
  },
  clear: () =>
    set((s) => (s.index >= 0
      ? { entries: [{ ...s.entries[s.index], root: true }], index: 0 }
      : { entries: [], index: -1 })),
}))

export const selectCanGoBack = (s: NavigationState): boolean => s.index > 0 && !s.entries[s.index].root
export const selectPrevious = (s: NavigationState): HistoryEntry | null => (s.index > 0 ? s.entries[s.index - 1] : null)

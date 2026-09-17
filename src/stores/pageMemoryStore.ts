import { create } from 'zustand'

/**
 * Session-only memory of what a page looked like when the reader left it,
 * keyed by the router's `location.key`. Each history entry has its own key,
 * so history Back restores the page exactly as it was, while a fresh visit
 * (a new push, hence a new key) starts clean.
 *
 * Deliberately not persisted, for the same reason as journalNavStore: a
 * scroll offset or a half-typed search means nothing after a restart.
 * Components write to it via getState() from effects and handlers; nothing
 * subscribes to `pages`, so scroll-time writes never re-render.
 */
export interface PageMemory {
  scrollTop: number
  state: Record<string, unknown>
}

interface PageMemoryState {
  pages: Record<string, PageMemory>
  rememberScroll: (key: string, scrollTop: number) => void
  rememberValue: (key: string, name: string, value: unknown) => void
  /** Drop pages the browser can no longer reach (a push discards the forward stack). */
  forget: (keys: string[]) => void
  clear: () => void
}

/** Belt and braces: the forward-stack prune keeps this small in practice. */
const MAX_PAGES = 50

function withPage(
  pages: Record<string, PageMemory>,
  key: string,
  update: (page: PageMemory) => PageMemory,
): Record<string, PageMemory> {
  const current = pages[key] ?? { scrollTop: 0, state: {} }
  const next = { ...pages, [key]: update(current) }
  const keys = Object.keys(next)
  if (keys.length > MAX_PAGES) {
    for (const stale of keys.slice(0, keys.length - MAX_PAGES)) delete next[stale]
  }
  return next
}

export const usePageMemoryStore = create<PageMemoryState>()((set) => ({
  pages: {},
  rememberScroll: (key, scrollTop) =>
    set((s) => ({ pages: withPage(s.pages, key, (p) => ({ ...p, scrollTop })) })),
  rememberValue: (key, name, value) =>
    set((s) => ({ pages: withPage(s.pages, key, (p) => ({ ...p, state: { ...p.state, [name]: value } })) })),
  forget: (keys) =>
    set((s) => {
      if (!keys.some((k) => k in s.pages)) return s
      const pages = { ...s.pages }
      for (const k of keys) delete pages[k]
      return { pages }
    }),
  clear: () => set({ pages: {} }),
}))

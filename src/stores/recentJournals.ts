import type { RecentJournal } from '../types/settings'

/**
 * How many journals the launcher remembers. Bounds how large the recents list
 * (which is persisted in localStorage with the rest of settings) can grow.
 */
export const MAX_RECENT_JOURNALS = 12

/**
 * Display name for a journal folder: its basename. Splits on both POSIX (`/`)
 * and Windows (`\`) separators and ignores a trailing slash so
 * `/a/b/` and `C:\Users\j\diary` resolve to `b` and `diary`.
 */
export function journalName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/**
 * Upsert `path` into a recents list, returning a new array: any existing entry
 * for the same path is dropped, the journal is placed at the front with a
 * fresh `lastOpenedAt`, and the list is capped at MAX_RECENT_JOURNALS. Pure
 * (no mutation) so it's safe to use inside a Zustand `set` updater and in the
 * persist migration.
 */
export function recordJournalEntry(list: RecentJournal[], path: string): RecentJournal[] {
  const entry: RecentJournal = { path, name: journalName(path), lastOpenedAt: new Date().toISOString() }
  const without = list.filter((j) => j.path !== path)
  return [entry, ...without].slice(0, MAX_RECENT_JOURNALS)
}

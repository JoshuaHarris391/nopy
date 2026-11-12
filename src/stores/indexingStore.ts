import { create } from 'zustand'
import { useNotificationStore } from './notificationStore'
import type { IndexProgress, IndexRunSummary, IndexFailure } from '../services/entryProcessor'

export type IndexingState = 'idle' | 'running' | 'done' | 'error'

interface IndexingStore {
  state: IndexingState
  /** The entry being indexed now, plus how many are saved and failed so far. */
  progress: { current: number; total: number; title: string; indexed: number; failed: number }
  result: string | null
  error: string | null
  /**
   * Entries the latest run could not index: entry id → reason. Kept after
   * the run (until the next one starts) so the Index page can mark the rows.
   * Not persisted.
   */
  failures: Record<string, string>
  run: (task: (onProgress: IndexProgress, signal: AbortSignal) => Promise<IndexRunSummary>) => Promise<void>
  abort: () => void
}

let controller: AbortController | null = null
let resultTimer: ReturnType<typeof setTimeout> | null = null

/** How long the inline result next to the button stays up. */
const RESULT_TTL_MS = 3000
/** Failure notices name entries and a reason, so they stay up longer than the default. */
const FAILURE_NOTICE_TTL_MS = 15000

const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`

/**
 * The one-line outcome shown next to the button. "Already up to date" means
 * exactly that nothing needed indexing; a run that tried and saved nothing
 * is reported as a failure by the store, never with this text.
 */
export function describeIndexRun(summary: IndexRunSummary): string {
  if (summary.attempted === 0) return 'Already up to date'
  if (summary.failed.length === 0) return `${entries(summary.indexed)} indexed`
  return `${summary.indexed} indexed, ${summary.failed.length} failed`
}

/** Up to three failed titles, then the first reason: enough to act on without opening the console. */
function describeFailures(failed: IndexFailure[]): string {
  const named = failed.slice(0, 3).map((f) => `"${f.title || 'Untitled'}"`).join(', ')
  const more = failed.length > 3 ? ` and ${failed.length - 3} more` : ''
  return `${named}${more}. ${failed[0].reason}`
}

function failureMap(failed: IndexFailure[]): Record<string, string> {
  return Object.fromEntries(failed.map((f) => [f.id, f.reason]))
}

/** A run stopped early by the indexer carries what it achieved; duck-typed so it survives module mocking. */
function summaryOf(e: unknown): IndexRunSummary | null {
  const err = e as { name?: unknown; summary?: IndexRunSummary } | null
  return err && err.name === 'IndexRunError' && err.summary ? err.summary : null
}

export const useIndexingStore = create<IndexingStore>()((set, get) => ({
  state: 'idle',
  progress: { current: 0, total: 0, title: '', indexed: 0, failed: 0 },
  result: null,
  error: null,
  failures: {},

  run: async (task) => {
    if (controller) { get().abort(); return }
    if (resultTimer) { clearTimeout(resultTimer); resultTimer = null }

    controller = new AbortController()
    const signal = controller.signal
    set({ state: 'running', result: null, error: null, failures: {}, progress: { current: 0, total: 0, title: '', indexed: 0, failed: 0 } })
    const notify = useNotificationStore.getState().push

    const fail = (message: string, failed: IndexFailure[]) => {
      set({ state: 'error', error: message, failures: failureMap(failed) })
      resultTimer = setTimeout(() => { set({ state: 'idle', error: null }); resultTimer = null }, RESULT_TTL_MS)
      // The inline text next to the button is gone in 3s and is off-screen
      // if the writer navigated away, so every failure also lands in the
      // bottom-right notification stack.
      notify({ kind: 'error', title: 'Indexing failed', message, ttlMs: FAILURE_NOTICE_TTL_MS })
    }

    try {
      const summary = await task(
        (c, t, title, counts) => set({ progress: { current: c, total: t, title, indexed: counts?.indexed ?? 0, failed: counts?.failed ?? 0 } }),
        signal,
      )
      if (signal.aborted) {
        // Stopped by the writer: everything finished before the stop is
        // already saved, so say how much that was.
        set({ state: 'idle', failures: failureMap(summary.failed) })
        if (summary.indexed > 0) {
          notify({ kind: 'info', title: 'Indexing stopped', message: `${entries(summary.indexed)} indexed before it was stopped.` })
        }
      } else if (summary.attempted > 0 && summary.indexed === 0) {
        fail(`No entries were indexed. ${describeFailures(summary.failed)}`, summary.failed)
      } else {
        const result = describeIndexRun(summary)
        set({ state: 'done', result, failures: failureMap(summary.failed) })
        resultTimer = setTimeout(() => { set({ state: 'idle', result: null }); resultTimer = null }, RESULT_TTL_MS)
        if (summary.failed.length > 0) {
          notify({
            kind: 'error',
            title: `${entries(summary.failed.length)} not indexed`,
            message: `${entries(summary.indexed)} indexed. Not indexed: ${describeFailures(summary.failed)}`,
            ttlMs: FAILURE_NOTICE_TTL_MS,
          })
        } else if (summary.indexed > 0) {
          notify({ kind: 'success', title: 'Indexing complete', message: result })
        }
      }
    } catch (e) {
      if (signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        set({ state: 'idle' })
      } else {
        fail(e instanceof Error ? e.message : String(e), summaryOf(e)?.failed ?? [])
      }
    } finally {
      controller = null
    }
  },

  abort: () => {
    controller?.abort()
  },
}))

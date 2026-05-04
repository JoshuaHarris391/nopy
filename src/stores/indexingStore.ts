import { create } from 'zustand'
import { useNotificationStore } from './notificationStore'

export type IndexingState = 'idle' | 'running' | 'done' | 'error'

interface IndexingStore {
  state: IndexingState
  progress: { current: number; total: number; title: string }
  result: string | null
  error: string | null
  run: (task: (onProgress: (c: number, t: number, title: string) => void, signal: AbortSignal) => Promise<string>) => Promise<void>
  abort: () => void
}

let controller: AbortController | null = null
let resultTimer: ReturnType<typeof setTimeout> | null = null

export const useIndexingStore = create<IndexingStore>()((set, get) => ({
  state: 'idle',
  progress: { current: 0, total: 0, title: '' },
  result: null,
  error: null,

  run: async (task) => {
    if (controller) { get().abort(); return }
    if (resultTimer) { clearTimeout(resultTimer); resultTimer = null }

    controller = new AbortController()
    const signal = controller.signal
    set({ state: 'running', result: null, error: null, progress: { current: 0, total: 0, title: '' } })

    try {
      const value = await task(
        (c, t, title) => set({ progress: { current: c, total: t, title } }),
        signal,
      )
      if (!signal.aborted) {
        set({ state: 'done', result: value })
        resultTimer = setTimeout(() => { set({ state: 'idle', result: null }); resultTimer = null }, 3000)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        set({ state: 'idle' })
      } else {
        const message = e instanceof Error ? e.message : String(e)
        set({ state: 'error', error: message })
        resultTimer = setTimeout(() => { set({ state: 'idle', error: null }); resultTimer = null }, 3000)
        // Errors during indexing are easy to miss with the inline-text-
        // next-to-button pattern (3s TTL, possibly off-screen if the user
        // navigated away). Surface them in the bottom-right notification
        // stack alongside chat errors. Successes stay inline since
        // they're contextual to where the action was triggered.
        useNotificationStore.getState().push({
          kind: 'error',
          title: 'Indexing failed',
          message,
        })
      }
    } finally {
      controller = null
    }
  },

  abort: () => {
    controller?.abort()
  },
}))

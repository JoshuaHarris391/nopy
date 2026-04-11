import { useState, useRef, useCallback } from 'react'

export type TaskState = 'idle' | 'running' | 'done' | 'error'

export interface CancellableTaskResult<T> {
  state: TaskState
  progress: { current: number; total: number; title: string }
  result: T | null
  error: string | null
  run: (task: (onProgress: (c: number, t: number, title: string) => void, signal: AbortSignal) => Promise<T>) => Promise<void>
  abort: () => void
}

export function useCancellableTask<T = string>(resultTimeout = 3000): CancellableTaskResult<T> {
  const [state, setState] = useState<TaskState>('idle')
  const [progress, setProgress] = useState({ current: 0, total: 0, title: '' })
  const [result, setResult] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  const run = useCallback(async (
    task: (onProgress: (c: number, t: number, title: string) => void, signal: AbortSignal) => Promise<T>,
  ) => {
    if (controllerRef.current) { abort(); return }
    const controller = new AbortController()
    controllerRef.current = controller
    setState('running')
    setResult(null)
    setError(null)
    setProgress({ current: 0, total: 0, title: '' })
    try {
      const value = await task(
        (c, t, title) => setProgress({ current: c, total: t, title }),
        controller.signal,
      )
      if (!controller.signal.aborted) {
        setState('done')
        setResult(value)
        setTimeout(() => { setState('idle'); setResult(null) }, resultTimeout)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setState('idle')
      } else {
        setState('error')
        setError(e instanceof Error ? e.message : String(e))
        setTimeout(() => { setState('idle'); setError(null) }, resultTimeout)
      }
    } finally {
      controllerRef.current = null
    }
  }, [abort, resultTimeout])

  return { state, progress, result, error, run, abort }
}

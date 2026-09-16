import { useState, useEffect, useRef, useCallback } from 'react'

export function useAutosave(
  save: () => Promise<void>,
  deps: unknown[],
  delay: number = 1500,
): {
  dirty: boolean
  markDirty: () => void
  markClean: () => void
  cancelPending: () => void
  /** Run the pending debounced save now (if anything is dirty) and resolve once it has finished. */
  flush: () => Promise<void>
} {
  const [dirty, setDirty] = useState(false)
  // Mirror of `dirty` so flush() can read the latest value synchronously,
  // without waiting for a render.
  const dirtyRef = useRef(false)
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!dirty) return
    cancel()
    timerRef.current = setTimeout(() => saveRef.current(), delay)
    return cancel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, delay, ...deps])

  const flush = useCallback(async () => {
    cancel()
    if (!dirtyRef.current) return
    await saveRef.current()
  }, [cancel])

  return {
    dirty,
    markDirty: useCallback(() => { dirtyRef.current = true; setDirty(true) }, []),
    markClean: useCallback(() => { dirtyRef.current = false; setDirty(false) }, []),
    cancelPending: cancel,
    flush,
  }
}

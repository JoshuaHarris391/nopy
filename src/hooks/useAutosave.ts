import { useState, useEffect, useRef, useCallback } from 'react'

export function useAutosave(
  save: () => Promise<void>,
  deps: unknown[],
  delay: number = 1500,
): { dirty: boolean; markDirty: () => void; markClean: () => void; cancelPending: () => void } {
  const [dirty, setDirty] = useState(false)
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

  return {
    dirty,
    markDirty: useCallback(() => setDirty(true), []),
    markClean: useCallback(() => setDirty(false), []),
    cancelPending: cancel,
  }
}

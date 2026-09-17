import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { useLocation } from 'react-router-dom'
import { usePageMemoryStore } from '../stores/pageMemoryStore'

/**
 * `useState` that survives leaving the page and coming back by history Back.
 * The value is remembered under the current history entry's `location.key`,
 * so Back finds it and a fresh visit (a new push) starts from `initial`.
 * The initial read is synchronous, so the first render already reflects the
 * remembered value: a filtered list is filtered before its scroll is restored.
 */
export function useRememberedState<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const { key } = useLocation()
  const [value, setValue] = useState<T>(() => {
    const page = usePageMemoryStore.getState().pages[key]
    if (page && name in page.state) return page.state[name] as T
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })

  useEffect(() => {
    usePageMemoryStore.getState().rememberValue(key, name, value)
  }, [key, name, value])

  return [value, setValue]
}

/**
 * Puts a page's scroll container back where the reader left it when they
 * return by history Back. Same mechanics as MonthScroll: the offset is
 * decided once at mount, applied before paint once `ready` (so a list that
 * is still loading does not get scrolled to nowhere), saved as the reader
 * scrolls (rAF-throttled) and once more on unmount.
 *
 * Attach the returned `onScroll` to the container that holds `ref`.
 */
export function useRememberedScroll(ref: RefObject<HTMLElement | null>, ready = true): { onScroll: () => void } {
  const { key } = useLocation()
  const [initial] = useState(() => usePageMemoryStore.getState().pages[key]?.scrollTop ?? 0)
  const appliedRef = useRef(false)

  useLayoutEffect(() => {
    if (!ready || appliedRef.current) return
    const el = ref.current
    if (!el) return
    appliedRef.current = true
    if (initial > 0) el.scrollTop = initial
  }, [ready, initial, ref])

  // The offset as of the last scroll event. A detached element reports 0, so
  // this is the fallback if the final save ever runs after removal.
  const lastRef = useRef(initial)
  const rafRef = useRef<number | null>(null)
  const onScroll = () => {
    const el = ref.current
    if (el) lastRef.current = el.scrollTop
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      usePageMemoryStore.getState().rememberScroll(key, lastRef.current)
    })
  }

  // A layout effect's cleanup runs while the page is still in the DOM (a
  // passive effect's would see it already removed), so the pane still
  // reports its true offset. Capture the element now: the ref is null by then.
  useLayoutEffect(() => {
    const el = ref.current
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (!el) return
      const scrollTop = el.isConnected ? el.scrollTop : lastRef.current
      usePageMemoryStore.getState().rememberScroll(key, scrollTop)
    }
  }, [key, ref])

  return { onScroll }
}

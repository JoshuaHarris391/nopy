import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribe to a CSS media query and re-render when it flips. Replaces the
 * matchMedia + addEventListener('change') boilerplate previously repeated
 * per query (system dark mode, reduced motion, narrow-viewport collapse).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(query)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

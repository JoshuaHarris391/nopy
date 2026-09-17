import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { useNavigationStore } from '../stores/navigationStore'

/**
 * Feeds every route change into navigationStore. Rendered first inside
 * AppShell so its commit lands before the page's own effects read the store.
 */
export function HistoryMirror() {
  const location = useLocation()
  const type = useNavigationType()

  useLayoutEffect(() => {
    useNavigationStore.getState().sync(location, type)
  }, [location, type])

  return null
}

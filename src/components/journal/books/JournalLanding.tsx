import { Navigate } from 'react-router-dom'
import { useJournalIndex } from '../../../hooks/useJournalIndex'
import { useEnsureEntriesLoaded } from '../../../hooks/useEnsureEntriesLoaded'
import { monthPath, resolveLandingMonth } from '../../../services/journalBooks'

/**
 * `/journal` is a resolver, not a page: once entries are loaded it lands the
 * reader in the current month (or the newest month with entries).
 */
export function JournalLanding() {
  const loaded = useEnsureEntriesLoaded()
  const index = useJournalIndex()
  if (!loaded) return null
  return <Navigate to={monthPath(resolveLandingMonth(index))} replace />
}

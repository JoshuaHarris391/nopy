import { Navigate, Outlet } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * Wraps the AI-only routes (chat, context, profile, index). While private
 * mode is on their nav links are hidden, but a typed URL or stale history
 * entry could still reach them — this sends the reader back to the journal.
 */
export function PrivateModeGuard() {
  const privateMode = useSettingsStore((s) => s.privateMode)
  return privateMode ? <Navigate to="/journal" replace /> : <Outlet />
}

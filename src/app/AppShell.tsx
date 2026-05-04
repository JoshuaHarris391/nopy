import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/sidebar/Sidebar'
import { BottomNav } from '../components/sidebar/BottomNav'
import { NotificationCard, type NotificationAccent } from '../components/ui/NotificationCard'
import { useIndexingStore } from '../stores/indexingStore'
import { useProfileStore } from '../stores/profileStore'
import { useNotificationStore } from '../stores/notificationStore'

const KIND_TO_ACCENT: Record<'error' | 'success' | 'info', NotificationAccent> = {
  error: 'error',
  success: 'success',
  info: 'neutral',
}

export function AppShell() {
  const indexingState = useIndexingStore((s) => s.state)
  const indexingProgress = useIndexingStore((s) => s.progress)
  const profileGenerating = useProfileStore((s) => s.generating)
  const profilePhase = useProfileStore((s) => s.phase)
  const profileProgress = useProfileStore((s) => s.progress)
  const notifications = useNotificationStore((s) => s.items)
  const dismissNotification = useNotificationStore((s) => s.dismiss)

  const showStack =
    indexingState === 'running' ||
    profileGenerating ||
    notifications.length > 0

  return (
    <div className="flex h-screen" style={{ animation: 'appIn 700ms ease-out 150ms forwards', opacity: 0 }}>
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
      <BottomNav />
      {showStack && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {indexingState === 'running' && (
            <NotificationCard
              title="Indexing..."
              inProgress
              progress={
                indexingProgress.total > 0
                  ? { current: indexingProgress.current, total: indexingProgress.total, label: indexingProgress.title }
                  : undefined
              }
            />
          )}
          {profileGenerating && (
            <NotificationCard
              title="Generating profile..."
              inProgress
              description={profilePhase || undefined}
              progress={
                profileProgress.total > 0
                  ? { current: profileProgress.current, total: profileProgress.total, label: profileProgress.title }
                  : undefined
              }
            />
          )}
          {notifications.map((n) => (
            <NotificationCard
              key={n.id}
              title={n.title}
              description={n.message}
              accent={KIND_TO_ACCENT[n.kind]}
              onDismiss={() => dismissNotification(n.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

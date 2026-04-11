import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/sidebar/Sidebar'
import { BottomNav } from '../components/sidebar/BottomNav'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useIndexingStore } from '../stores/indexingStore'
import { useProfileStore } from '../stores/profileStore'

export function AppShell() {
  const indexingState = useIndexingStore((s) => s.state)
  const indexingProgress = useIndexingStore((s) => s.progress)
  const profileGenerating = useProfileStore((s) => s.generating)
  const profilePhase = useProfileStore((s) => s.phase)
  const profileProgress = useProfileStore((s) => s.progress)

  return (
    <div className="flex h-screen" style={{ animation: 'appIn 700ms ease-out 150ms forwards', opacity: 0 }}>
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
      <BottomNav />
      {(indexingState === 'running' || profileGenerating) && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {indexingState === 'running' && (
            <div style={{
              background: 'var(--parchment)', border: '1px solid var(--stone)',
              borderRadius: 'var(--radius-sm)', padding: '14px 18px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              minWidth: 280, maxWidth: 340,
            }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
                Indexing...
              </div>
              <ProgressBar current={indexingProgress.current} total={indexingProgress.total} label={indexingProgress.title} />
            </div>
          )}
          {profileGenerating && (
            <div style={{
              background: 'var(--parchment)', border: '1px solid var(--stone)',
              borderRadius: 'var(--radius-sm)', padding: '14px 18px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              minWidth: 280, maxWidth: 340,
            }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
                Generating profile...
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginBottom: profileProgress.total > 0 ? 8 : 0 }}>
                {profilePhase}
              </div>
              {profileProgress.total > 0 && (
                <ProgressBar current={profileProgress.current} total={profileProgress.total} label={profileProgress.title} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/sidebar/Sidebar'
import { BottomNav } from '../components/sidebar/BottomNav'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useIndexingStore } from '../stores/indexingStore'

export function AppShell() {
  const indexingState = useIndexingStore((s) => s.state)
  const progress = useIndexingStore((s) => s.progress)

  return (
    <div className="flex h-screen" style={{ animation: 'appIn 700ms ease-out 150ms forwards', opacity: 0 }}>
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {indexingState === 'running' && (
          <div style={{ padding: '12px 44px 0' }}>
            <ProgressBar current={progress.current} total={progress.total} label={progress.title} />
          </div>
        )}
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

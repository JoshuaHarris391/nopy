import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/sidebar/Sidebar'
import { BottomNav } from '../components/sidebar/BottomNav'

export function AppShell() {
  return (
    <div className="flex h-screen" style={{ animation: 'appIn 700ms ease-out 150ms forwards', opacity: 0 }}>
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

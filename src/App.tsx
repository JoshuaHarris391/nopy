import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { PrivateModeGuard } from './app/PrivateModeGuard'
import { JournalLanding } from './components/journal/books/JournalLanding'
import { BookshelfView } from './components/journal/books/BookshelfView'
import { BookView } from './components/journal/books/BookView'
import { ChatView } from './components/chat/ChatView'
import { ContextView } from './components/context/ContextView'
import { ProfileView } from './components/profile/ProfileView'
import { InsightsView } from './components/insights/InsightsView'
import { IndexView } from './components/index/IndexView'
import { SettingsView } from './components/settings/SettingsView'
import { EntryEditor } from './components/journal/EntryEditor'
import { useSettingsStore } from './stores/settingsStore'
import { grantFsScope } from './services/fs'

export default function App() {
  const journalPath = useSettingsStore((s) => s.journalPath)
  const theme = useSettingsStore((s) => s.theme)
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed)

  // Always start with the sidebar expanded, regardless of persisted state
  useEffect(() => {
    setSidebarCollapsed(false)
  }, [setSidebarCollapsed])

  // Grant fs scope on startup for saved journal path
  useEffect(() => {
    if (journalPath) {
      grantFsScope(journalPath)
    }
  }, [journalPath])

  // Sync theme to document; when 'system', follow OS prefers-color-scheme live.
  useEffect(() => {
    if (theme !== 'system') {
      document.documentElement.dataset.theme = theme
      return
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = mql.matches ? 'dark' : 'light'
    }
    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [theme])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/journal" replace />} />
          <Route path="journal" element={<JournalLanding />} />
          <Route path="journal/books" element={<BookshelfView />} />
          <Route path="journal/books/:year/:month?" element={<BookView />} />
          <Route path="journal/new" element={<EntryEditor />} />
          <Route path="journal/:id" element={<EntryEditor />} />
          <Route element={<PrivateModeGuard />}>
            <Route path="chat" element={<ChatView />} />
            <Route path="context" element={<ContextView />} />
            <Route path="profile" element={<ProfileView />} />
            <Route path="insights" element={<InsightsView />} />
            <Route path="index" element={<IndexView />} />
          </Route>
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

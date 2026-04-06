import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { JournalView } from './components/journal/JournalView'
import { ChatView } from './components/chat/ChatView'
import { ProfileView } from './components/profile/ProfileView'
import { IndexView } from './components/index/IndexView'
import { SettingsView } from './components/settings/SettingsView'
import { EntryEditor } from './components/journal/EntryEditor'
import { useSettingsStore } from './stores/settingsStore'
import { grantFsScope } from './services/fs'

export default function App() {
  const journalPath = useSettingsStore((s) => s.journalPath)
  const theme = useSettingsStore((s) => s.theme)

  // Grant fs scope on startup for saved journal path
  useEffect(() => {
    if (journalPath) {
      grantFsScope(journalPath)
    }
  }, [journalPath])

  // Sync theme to document
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<JournalView />} />
          <Route path="journal/new" element={<EntryEditor />} />
          <Route path="journal/:id" element={<EntryEditor />} />
          <Route path="chat" element={<ChatView />} />
          <Route path="profile" element={<ProfileView />} />
          <Route path="index" element={<IndexView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

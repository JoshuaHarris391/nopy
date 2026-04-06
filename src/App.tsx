import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { JournalView } from './components/journal/JournalView'
import { ChatView } from './components/chat/ChatView'
import { ProfileView } from './components/profile/ProfileView'
import { IndexView } from './components/index/IndexView'
import { SettingsView } from './components/settings/SettingsView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<JournalView />} />
          <Route path="chat" element={<ChatView />} />
          <Route path="profile" element={<ProfileView />} />
          <Route path="index" element={<IndexView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

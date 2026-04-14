import { useState, useCallback } from 'react'
import { FolderOpen, BookOpen } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { SettingsRow } from '../../ui/SettingsRow'
import { NewJournalDialog } from '../../ui/NewJournalDialog'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useJournalStore } from '../../../stores/journalStore'
import { useProfileStore } from '../../../stores/profileStore'
import { useChatStore } from '../../../stores/chatStore'
import { hasFileSystem, pickJournalDirectory, grantFsScope, slugify } from '../../../services/fs'
import { flushChatSave } from '../../../services/chatPersistence'

const buttonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 12px',
  border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
  background: 'transparent', color: 'var(--ink)',
  transition: 'all var(--transition-gentle)',
}

export function DataPrivacySection() {
  const journalPath = useSettingsStore((s) => s.journalPath)
  const setJournalPath = useSettingsStore((s) => s.setJournalPath)
  const canPickDirectory = hasFileSystem()
  const [status, setStatus] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const flashStatus = useCallback((msg: string) => {
    setStatus(msg)
    setTimeout(() => setStatus(null), 4000)
  }, [])

  const switchJournal = useCallback(async (path: string, label = 'Journal switched') => {
    await flushChatSave()

    await useChatStore.getState().clear()
    await useJournalStore.getState().clear()
    await useProfileStore.getState().clear()

    setJournalPath(path)
    await grantFsScope(path)

    await useJournalStore.getState().loadEntries()
    const { added } = await useJournalStore.getState().syncFromDisk()
    await useChatStore.getState().loadSessionList()
    const profileLoaded = await useProfileStore.getState().loadProfileFromDisk()

    const bits = [`${added} entries`]
    if (profileLoaded) bits.push('existing profile restored')
    flashStatus(`${label} — ${bits.join(', ')}`)
  }, [setJournalPath, flashStatus])

  const handleSelectJournal = useCallback(async () => {
    const path = await pickJournalDirectory()
    if (!path) return
    await switchJournal(path)
  }, [switchJournal])

  const handleCreateJournal = useCallback(async (name: string) => {
    const slug = slugify(name, name)
    if (!slug) {
      flashStatus('Invalid journal name')
      return
    }
    const parent = await pickJournalDirectory()
    if (!parent) return
    const newPath = `${parent}/${slug}`
    const { mkdir, exists } = await import('@tauri-apps/plugin-fs')
    if (await exists(newPath)) {
      flashStatus(`Folder already exists at ${newPath}`)
      return
    }
    await mkdir(newPath, { recursive: true })
    await grantFsScope(newPath)
    setShowCreate(false)
    await switchJournal(newPath, 'New journal created')
  }, [switchJournal, flashStatus])

  return (
    <SettingsSection title="Data & Privacy">
      <SettingsRow
        label="Journal"
        description={journalPath || (canPickDirectory ? 'Not set — entries stored in browser only' : 'Run the desktop app to save entries as local files')}
        descriptionFont="mono"
      >
        {canPickDirectory && (
          <button onClick={handleSelectJournal} className="flex items-center gap-1.5 cursor-pointer" style={buttonStyle}>
            <FolderOpen size={13} strokeWidth={1.8} />
            Change folder…
          </button>
        )}
      </SettingsRow>

      {canPickDirectory && (
        <SettingsRow label="New journal" description="Create an empty journal folder and switch to it">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 cursor-pointer flex-shrink-0"
            style={buttonStyle}
          >
            <BookOpen size={13} strokeWidth={1.8} />
            Create…
          </button>
        </SettingsRow>
      )}

      {status && (
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)', padding: '8px 0' }}>
          {status}
        </div>
      )}

      {showCreate && (
        <NewJournalDialog
          onCreate={handleCreateJournal}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </SettingsSection>
  )
}

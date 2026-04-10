import { useState, useCallback } from 'react'
import { FolderOpen, BookOpen } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { SettingsRow } from '../../ui/SettingsRow'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useJournalStore } from '../../../stores/journalStore'
import { useProfileStore } from '../../../stores/profileStore'
import { hasFileSystem, pickJournalDirectory, grantFsScope } from '../../../services/fs'
import { del } from 'idb-keyval'

export function DataPrivacySection() {
  const journalPath = useSettingsStore((s) => s.journalPath)
  const setJournalPath = useSettingsStore((s) => s.setJournalPath)
  const canPickDirectory = hasFileSystem()
  const [showNewJournalConfirm, setShowNewJournalConfirm] = useState(false)
  const [newJournalStatus, setNewJournalStatus] = useState<string | null>(null)

  const handleNewJournal = useCallback(async () => {
    const path = await pickJournalDirectory()
    if (!path) return

    await del('nopy-entries')
    await del('nopy-profile')
    useJournalStore.setState({ entries: [], loaded: false })
    useProfileStore.setState({ profile: null, loaded: false })

    setJournalPath(path)
    await grantFsScope(path)

    await useJournalStore.getState().loadEntries()
    const { added } = await useJournalStore.getState().syncFromDisk()
    setNewJournalStatus(`Switched to new journal — ${added} entries loaded`)
    setTimeout(() => setNewJournalStatus(null), 4000)
    setShowNewJournalConfirm(false)
  }, [setJournalPath])

  return (
    <SettingsSection title="Data & Privacy">
      <SettingsRow
        label="Journal location"
        description={journalPath || (canPickDirectory ? 'Not set — entries stored in browser only' : 'Run the desktop app to save entries as local files')}
        descriptionFont="mono"
      >
        {canPickDirectory && (
          <button
            onClick={async () => {
              const path = await pickJournalDirectory()
              if (path) setJournalPath(path)
            }}
            className="flex items-center gap-1.5 cursor-pointer"
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 12px',
              border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
              background: 'transparent', color: 'var(--ink)',
              transition: 'all var(--transition-gentle)',
            }}
          >
            <FolderOpen size={13} strokeWidth={1.8} />
            Change
          </button>
        )}
      </SettingsRow>

      {canPickDirectory && (
        <SettingsRow label="Switch journal" description="Point to a different folder — clears current entries from the app and loads from the new location">
          <button
            onClick={() => setShowNewJournalConfirm(true)}
            className="flex items-center gap-1.5 cursor-pointer flex-shrink-0"
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 12px',
              border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
              background: 'transparent', color: 'var(--ink)',
              transition: 'all var(--transition-gentle)',
            }}
          >
            <BookOpen size={13} strokeWidth={1.8} />
            New Journal
          </button>
        </SettingsRow>
      )}

      {newJournalStatus && (
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)', padding: '8px 0' }}>
          {newJournalStatus}
        </div>
      )}

      <ConfirmDialog
        open={showNewJournalConfirm}
        title="Switch to a new journal?"
        body="This will clear the current entries and profile from the app and load entries from the new folder you select. Your existing files on disk are not affected."
        confirmLabel="Choose folder"
        danger={false}
        onConfirm={handleNewJournal}
        onCancel={() => setShowNewJournalConfirm(false)}
      />
    </SettingsSection>
  )
}

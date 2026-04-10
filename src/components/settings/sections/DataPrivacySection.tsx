import { useState, useCallback } from 'react'
import { FolderOpen, BookOpen } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { SettingsRow } from '../../ui/SettingsRow'
import { Button } from '../../ui/Button'
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

      {showNewJournalConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(44, 62, 44, 0.3)' }}
          onClick={() => setShowNewJournalConfirm(false)}
        >
          <div
            className="flex flex-col gap-4"
            style={{
              background: 'var(--parchment)', border: '1px solid var(--stone)',
              borderRadius: 'var(--radius-lg)', padding: '28px 32px',
              maxWidth: 420, boxShadow: '0 12px 40px var(--shadow-warm-deep)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
              Switch to a new journal?
            </h3>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.6 }}>
              This will clear the current entries and profile from the app and load entries from the new folder you select. Your existing files on disk are not affected.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowNewJournalConfirm(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleNewJournal}>
                <FolderOpen size={14} strokeWidth={2} />
                Choose folder
              </Button>
            </div>
          </div>
        </div>
      )}
    </SettingsSection>
  )
}

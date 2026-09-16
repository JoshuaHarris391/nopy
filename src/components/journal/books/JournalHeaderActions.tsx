import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '../../ui/Button'
import { useJournalStore } from '../../../stores/journalStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { hasFileSystem } from '../../../services/fs'

/** Sync + New Entry, shared by the shelf and the open book. */
export function JournalHeaderActions() {
  const navigate = useNavigate()
  const syncFromDisk = useJournalStore((s) => s.syncFromDisk)
  const syncing = useJournalStore((s) => s.syncing)
  const journalPath = useSettingsStore((s) => s.journalPath)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const canSync = hasFileSystem() && !!journalPath

  const handleSync = async () => {
    setSyncResult(null)
    const { added, updated, removed } = await syncFromDisk()
    if (added === 0 && updated === 0 && removed === 0) {
      setSyncResult('Already up to date')
    } else {
      const parts = []
      if (added > 0) parts.push(`${added} new`)
      if (updated > 0) parts.push(`${updated} updated`)
      if (removed > 0) parts.push(`${removed} removed`)
      setSyncResult(parts.join(', '))
    }
    setTimeout(() => setSyncResult(null), 3000)
  }

  return (
    <>
      {syncResult && (
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)' }}>
          {syncResult}
        </span>
      )}
      {canSync && (
        <Button variant="secondary" onClick={handleSync} disabled={syncing}>
          <RefreshCw size={14} strokeWidth={2} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync'}
        </Button>
      )}
      <Button variant="primary" onClick={() => navigate('/journal/new')}>
        <Plus size={14} strokeWidth={2} />
        New Entry
      </Button>
    </>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, BookOpen, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { MainHeader } from '../ui/MainHeader'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { EntryCard } from './EntryCard'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { hasFileSystem } from '../../services/fs'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function JournalView() {
  const navigate = useNavigate()
  const { entries, loaded, loadEntries, syncFromDisk, syncing } = useJournalStore()
  const journalPath = useSettingsStore((s) => s.journalPath)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const canSync = hasFileSystem() && !!journalPath

  useEffect(() => {
    if (!loaded) loadEntries()
  }, [loaded, loadEntries])

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
      <MainHeader title="Journal">
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
      </MainHeader>
      <div className="flex-1 overflow-y-auto" style={{ padding: '36px 44px' }}>
        {/* Greeting */}
        <div style={{ fontFamily: 'var(--font-agent)', fontSize: 18, fontWeight: 400, color: 'var(--bark)', marginBottom: 8, lineHeight: 1.5 }}>
          {getGreeting()}. How are you arriving today?
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)', marginBottom: 28 }}>
          {format(new Date(), 'EEEE, d MMMM yyyy')}
          {entries.length > 0 && ` · ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
          {syncResult && (
            <span style={{ color: 'var(--gentle-green)', marginLeft: 8 }}>
              · {syncResult}
            </span>
          )}
        </div>

        {/* Entries */}
        {loaded && entries.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={48} strokeWidth={1.2} />}
            title="Your journal awaits"
            description="Start your first entry to begin building a record of your inner world."
            action={
              <Button onClick={() => navigate('/journal/new')}>
                <Plus size={14} strokeWidth={2} />
                Write your first entry
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3.5">
            {entries.map((entry, i) => (
              <EntryCard key={entry.id} entry={entry} index={i} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

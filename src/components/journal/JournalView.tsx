import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, BookOpen } from 'lucide-react'
import { format } from 'date-fns'
import { MainHeader } from '../ui/MainHeader'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { EntryCard } from './EntryCard'
import { useJournalStore } from '../../stores/journalStore'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function JournalView() {
  const navigate = useNavigate()
  const { entries, loaded, loadEntries } = useJournalStore()

  useEffect(() => {
    if (!loaded) loadEntries()
  }, [loaded, loadEntries])

  return (
    <>
      <MainHeader title="Journal">
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
          <div className="flex flex-col gap-3.5" style={{ maxWidth: 740 }}>
            {entries.map((entry, i) => (
              <EntryCard key={entry.id} entry={entry} index={i} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Search, BookOpen } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { EmptyState } from '../ui/EmptyState'
import { MoodDot } from '../ui/MoodDot'
import { useJournalStore } from '../../stores/journalStore'

export function IndexView() {
  const navigate = useNavigate()
  const { entries, loaded, loadEntries } = useJournalStore()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!loaded) loadEntries()
  }, [loaded, loadEntries])

  const filtered = entries.filter((e) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)) ||
      (e.summary?.toLowerCase().includes(q) ?? false)
    )
  })

  return (
    <>
      <MainHeader title="Index">
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--sage)' }}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </MainHeader>
      <div className="flex-1 overflow-y-auto" style={{ padding: '36px 44px' }}>
        <div style={{ maxWidth: 840 }}>
          {loaded && entries.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={48} strokeWidth={1.2} />}
              title="No entries yet"
              description="Your journal index will appear here as you write entries."
            />
          ) : (
            <>
              {/* Search */}
              <div
                className="flex items-center gap-2.5"
                style={{
                  background: 'var(--warm-cream)',
                  border: '1px solid var(--stone)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '9px 14px',
                  marginBottom: 20,
                  transition: 'border-color var(--transition-gentle)',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--bark)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--stone)')}
              >
                <Search size={15} strokeWidth={2} style={{ color: 'var(--sage)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search entries by title, theme, or keyword..."
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink)', outline: 'none',
                  }}
                />
              </div>

              {/* Table */}
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'var(--font-ui)', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Date', 'Title', 'Mood', 'Tags', 'Summary'].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left', padding: '9px 12px', fontSize: 10.5,
                          textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sage)',
                          fontWeight: 600, borderBottom: '2px solid var(--stone)', whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => navigate(`/journal/${entry.id}`)}
                      className="cursor-pointer"
                      style={{ transition: 'background var(--transition-gentle)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--warm-cream)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '11px 12px', borderBottom: '1px solid rgba(212, 201, 184, 0.35)', width: 100, color: 'var(--sage)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {format(new Date(entry.createdAt), 'd MMM')}
                      </td>
                      <td style={{ padding: '11px 12px', borderBottom: '1px solid rgba(212, 201, 184, 0.35)', fontWeight: 500, color: 'var(--ink)' }}>
                        {entry.title || 'Untitled'}
                      </td>
                      <td style={{ padding: '11px 12px', borderBottom: '1px solid rgba(212, 201, 184, 0.35)', width: 50 }}>
                        {entry.mood && (
                          <span className="flex items-center gap-1">
                            <MoodDot mood={entry.mood} />
                            <span>{entry.mood.value}</span>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '11px 12px', borderBottom: '1px solid rgba(212, 201, 184, 0.35)', width: 170 }}>
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: 9.5, padding: '1px 6px', background: 'var(--warm-cream)',
                              border: '1px solid rgba(212, 201, 184, 0.5)', borderRadius: 10,
                              color: 'var(--bark)', display: 'inline-block', margin: '1px 2px', whiteSpace: 'nowrap',
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </td>
                      <td style={{ padding: '11px 12px', borderBottom: '1px solid rgba(212, 201, 184, 0.35)', color: 'var(--manuscript)', opacity: 0.7, fontSize: 12, maxWidth: 240, lineHeight: 1.5 }}>
                        {entry.summary || '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filtered.length === 0 && search && (
                <div className="py-8 text-center" style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--sage)' }}>
                  No entries match "{search}"
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Search, BookOpen, Sparkles, ChevronDown } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { EmptyState } from '../ui/EmptyState'
import { MoodDot } from '../ui/MoodDot'
import { ProgressBar } from '../ui/ProgressBar'
import { CancellableActionButton } from '../ui/CancellableActionButton'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useCancellableTask } from '../../hooks/useCancellableTask'

export function IndexView() {
  const navigate = useNavigate()
  const entries = useJournalStore((s) => s.entries)
  const loaded = useJournalStore((s) => s.loaded)
  const loadEntries = useJournalStore((s) => s.loadEntries)
  const [search, setSearch] = useState('')
  const apiKey = useSettingsStore((s) => s.apiKey)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const task = useCancellableTask<string>()

  const handleUpdateIndex = () => {
    if (!apiKey) return
    task.run(async (onProgress, signal) => {
      const count = await useJournalStore.getState().processEntries(apiKey, false, onProgress, signal)
      return count > 0 ? `${count} ${count === 1 ? 'entry' : 'entries'} indexed` : 'Already up to date'
    })
  }

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
        {apiKey && (
          <CancellableActionButton
            state={task.state}
            result={task.result}
            error={task.error}
            idleLabel="Update Index"
            icon={<Sparkles size={13} strokeWidth={1.8} />}
            onRun={handleUpdateIndex}
            onAbort={task.abort}
          />
        )}
      </MainHeader>
      <div className="flex-1 overflow-y-auto" style={{ padding: '36px 44px' }}>
        <div>
          {loaded && entries.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={48} strokeWidth={1.2} />}
              title="No entries yet"
              description="Your journal index will appear here as you write entries."
            />
          ) : (
            <>
              {/* Progress */}
              {task.state === 'running' && (
                <div style={{ marginBottom: 16 }}>
                  <ProgressBar current={task.progress.current} total={task.progress.total} label={task.progress.title} />
                </div>
              )}

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
              <table className="w-full table-auto" style={{ borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'var(--font-ui)', fontSize: 15.5 }}>
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold" style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sage)', borderBottom: '2px solid var(--stone)' }}>Date</th>
                    <th className="text-left px-3 py-2 font-semibold" style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sage)', borderBottom: '2px solid var(--stone)' }}>Title</th>
                    <th className="text-left px-3 py-2 font-semibold" style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sage)', borderBottom: '2px solid var(--stone)' }}>Mood</th>
                    <th className="hidden sm:table-cell text-left px-3 py-2 font-semibold" style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sage)', borderBottom: '2px solid var(--stone)' }}>Tags</th>
                    <th className="hidden lg:table-cell text-left px-3 py-2 font-semibold w-full" style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sage)', borderBottom: '2px solid var(--stone)' }}>Summary</th>
                    <th className="lg:hidden" style={{ borderBottom: '2px solid var(--stone)', width: 40 }} />
                  </tr>
                </thead>
                {filtered.map((entry) => {
                  const isExpanded = expandedId === entry.id
                  return (
                    <tbody key={entry.id}>
                      <tr
                        onClick={() => navigate(`/journal/${entry.id}`)}
                        className="cursor-pointer transition-colors hover:bg-[var(--warm-cream)]"
                      >
                        <td className="px-3 py-2.5 align-top" style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(212, 201, 184, 0.35)', color: 'var(--sage)', fontWeight: 500 }}>
                          {format(new Date(entry.createdAt), 'd MMM')}
                        </td>
                        <td className="px-3 py-2.5 align-top" style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(212, 201, 184, 0.35)', fontWeight: 500, color: 'var(--ink)', minWidth: 300 }}>
                          {entry.title || 'Untitled'}
                        </td>
                        <td className="px-3 py-2.5 align-top" style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(212, 201, 184, 0.35)' }}>
                          {entry.mood && (
                            <span className="flex items-center gap-1">
                              <MoodDot mood={entry.mood} />
                              <span>{entry.mood.value}</span>
                            </span>
                          )}
                        </td>
                        <td className="hidden sm:table-cell px-3 py-2.5 align-top" style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(212, 201, 184, 0.35)' }}>
                          <div className="flex flex-wrap gap-1">
                            {entry.tags.map((tag) => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: 11.5, padding: '1px 6px', background: 'var(--warm-cream)',
                                  border: '1px solid rgba(212, 201, 184, 0.5)', borderRadius: 10,
                                  color: 'var(--bark)', whiteSpace: 'nowrap',
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-3 py-2.5 align-top" style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(212, 201, 184, 0.35)', color: 'var(--manuscript)', opacity: 0.7, fontSize: 14.5, lineHeight: 1.5 }}>
                          {entry.summary || '\u2014'}
                        </td>
                        <td className="lg:hidden px-3 py-2.5 align-top" style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(212, 201, 184, 0.35)' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : entry.id) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--sage)', display: 'flex', alignItems: 'center' }}
                          >
                            <ChevronDown
                              size={20}
                              style={{ transition: 'transform 200ms ease-out', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            />
                          </button>
                        </td>
                      </tr>
                      <tr className="lg:hidden">
                        <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid rgba(212, 201, 184, 0.35)' }}>
                          <div
                            className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
                          >
                            <div style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 16 }}>
                              {entry.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2 sm:hidden">
                                  {entry.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      style={{
                                        fontSize: 12, padding: '1px 6px', background: 'var(--warm-cream)',
                                        border: '1px solid rgba(212, 201, 184, 0.5)', borderRadius: 10,
                                        color: 'var(--bark)', whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.65 }}>
                                {entry.summary || '—'}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  )
                })}
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

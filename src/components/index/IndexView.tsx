import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Search, BookOpen, Sparkles } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { EmptyState } from '../ui/EmptyState'
import { MoodDot } from '../ui/MoodDot'
import { ProgressBar } from '../ui/ProgressBar'
import { Button } from '../ui/Button'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore } from '../../stores/settingsStore'

export function IndexView() {
  const navigate = useNavigate()
  const { entries, loaded, loadEntries } = useJournalStore()
  const [search, setSearch] = useState('')
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number; title: string }>({ current: 0, total: 0, title: '' })
  const [result, setResult] = useState<string | null>(null)
  const apiKey = useSettingsStore((s) => s.apiKey)
  const abortRef = useRef<AbortController | null>(null)
  const [hovered, setHovered] = useState(false)

  const handleUpdateIndex = useCallback(async () => {
    if (!apiKey) return
    if (processing) {
      abortRef.current?.abort()
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setProcessing(true)
    setResult(null)
    try {
      const count = await useJournalStore.getState().processEntries(apiKey, false, (current, total, title) => {
        setProgress({ current, total, title })
      }, controller.signal)
      setResult(count > 0 ? `${count} ${count === 1 ? 'entry' : 'entries'} indexed` : 'Already up to date')
      setTimeout(() => setResult(null), 3000)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setResult('Cancelled')
      } else {
        setResult('Indexing failed')
      }
      setTimeout(() => setResult(null), 3000)
    } finally {
      abortRef.current = null
      setProcessing(false)
    }
  }, [processing, apiKey])

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
          <Button
            variant="secondary"
            onClick={handleUpdateIndex}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={processing ? 'btn-cancellable' : undefined}
          >
            {processing ? (
              <>
                <span style={{ visibility: hovered ? 'hidden' : 'visible' }}><Sparkles size={13} strokeWidth={1.8} />Updating...</span>
                <span style={{ visibility: hovered ? 'visible' : 'hidden' }}><Sparkles size={13} strokeWidth={1.8} />Stop</span>
              </>
            ) : (
              <><Sparkles size={13} strokeWidth={1.8} />Update Index</>
            )}
          </Button>
        )}
        {result && (
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)', fontWeight: 500 }}>
            {result}
          </span>
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
              {processing && (
                <div style={{ marginBottom: 16 }}>
                  <ProgressBar current={progress.current} total={progress.total} label={progress.title} />
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
                    <th className="text-left px-3 py-2 font-semibold" style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sage)', borderBottom: '2px solid var(--stone)' }}>Tags</th>
                    <th className="text-left px-3 py-2 font-semibold w-full" style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sage)', borderBottom: '2px solid var(--stone)' }}>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => navigate(`/journal/${entry.id}`)}
                      className="cursor-pointer transition-colors hover:bg-[var(--warm-cream)]"
                    >
                      <td className="px-3 py-2.5 align-top" style={{ borderBottom: '1px solid rgba(212, 201, 184, 0.35)', color: 'var(--sage)', fontWeight: 500 }}>
                        {format(new Date(entry.createdAt), 'd MMM')}
                      </td>
                      <td className="px-3 py-2.5 align-top" style={{ borderBottom: '1px solid rgba(212, 201, 184, 0.35)', fontWeight: 500, color: 'var(--ink)', minWidth: 300 }}>
                        {entry.title || 'Untitled'}
                      </td>
                      <td className="px-3 py-2.5 align-top" style={{ borderBottom: '1px solid rgba(212, 201, 184, 0.35)' }}>
                        {entry.mood && (
                          <span className="flex items-center gap-1">
                            <MoodDot mood={entry.mood} />
                            <span>{entry.mood.value}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top" style={{ borderBottom: '1px solid rgba(212, 201, 184, 0.35)' }}>
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
                      <td className="px-3 py-2.5 align-top" style={{ borderBottom: '1px solid rgba(212, 201, 184, 0.35)', color: 'var(--manuscript)', opacity: 0.7, fontSize: 14.5, lineHeight: 1.5 }}>
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

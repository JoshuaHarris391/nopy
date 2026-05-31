import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, FolderOpen, Plus, ArrowLeft, X, AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { slugify, pickJournalDirectory, grantFsScope, journalPathExists, createJournalFolder } from '../../services/fs'
import { switchJournal as runJournalSwitch } from '../../services/journalSwitch'
import { useSettingsStore } from '../../stores/settingsStore'
import nopyLogo from '../../assets/nopy_logo_v2_detail.png'
import nopyLogoDark from '../../assets/nopy_logo_v2_detail_white.png'

interface JournalLauncherProps {
  /** Called once a journal has been created or opened and the app has switched into it. */
  onChosen: () => void
}

type View = 'picker' | 'create-name' | 'create-location'

/**
 * Full-screen journal launcher shown on every app start (mounted by AppShell,
 * desktop-only). The user either opens a previously-used journal, browses to an
 * existing journal folder, or creates a new one. A fresh install has no recents,
 * so the picker renders its welcome / first-journal state.
 *
 * The overlay is intentionally NOT dismissible — choosing a journal is required
 * to enter the app — so there is no Escape handler, backdrop-click close, or
 * cancel action. The only ways out are opening or creating a journal.
 */
export function JournalLauncher({ onChosen }: JournalLauncherProps) {
  const recentJournals = useSettingsStore((s) => s.recentJournals)
  const journalPath = useSettingsStore((s) => s.journalPath)
  const recordJournal = useSettingsStore((s) => s.recordJournal)
  const removeRecentJournal = useSettingsStore((s) => s.removeRecentJournal)
  const theme = useSettingsStore((s) => s.theme)

  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const isDark = theme === 'dark' || (theme === 'system' && systemDark)

  const [view, setView] = useState<View>('picker')
  const [name, setName] = useState('')
  const [parent, setParent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<Set<string>>(new Set())

  const nameInputRef = useRef<HTMLInputElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  const trimmedName = name.trim()
  const slug = slugify(trimmedName, trimmedName)
  const canContinueName = slug.length > 0
  const finalPath = parent ? `${parent}/${slug}` : null

  // Recents are stored most-recent-first, but sort defensively so display order
  // is always correct regardless of how the list was assembled.
  const recents = useMemo(
    () => [...recentJournals].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)),
    [recentJournals],
  )
  // The journal we'll preselect/highlight: the last-used one if it's in the
  // list, otherwise the most recent. Lets the user continue with one click/Enter.
  const highlightedPath = recents.some((j) => j.path === journalPath)
    ? journalPath
    : recents[0]?.path ?? null

  // Track theme changes from the OS so the logo swaps live.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Save/restore focus around the takeover for accessibility.
  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null
    return () => { prevFocusRef.current?.focus() }
  }, [])

  // Focus the name input when entering the naming step.
  useEffect(() => {
    if (view === 'create-name') nameInputRef.current?.focus()
  }, [view])

  // Flag recents whose folder no longer exists so they can't be opened (and can
  // be removed). Runs once on mount against the current recents.
  //
  // Tauri's filesystem scope is granted dynamically (grant_fs_scope) and is NOT
  // persisted across restarts, so on a fresh launch we have no scope for the
  // recent paths yet — exists() would be denied and every journal would show as
  // "not found". We re-grant scope for each path before checking it.
  useEffect(() => {
    if (recents.length === 0) return
    let cancelled = false
    void (async () => {
      const gone = new Set<string>()
      for (const j of recents) {
        try {
          await grantFsScope(j.path)
          if (!(await journalPathExists(j.path))) gone.add(j.path)
        } catch {
          gone.add(j.path)
        }
      }
      if (!cancelled) setMissing(gone)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = (path: string) => {
    recordJournal(path)
    onChosen()
  }

  // Open an existing journal (a recent row or a browsed folder). Verifies the
  // folder is still there, switches the whole app into it, then records it.
  const handleOpen = async (path: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // Grant scope before the existence check — on a fresh launch Tauri has no
      // scope for this path yet, so exists() would wrongly report it missing.
      await grantFsScope(path)
      if (!(await journalPathExists(path))) {
        setMissing((prev) => new Set(prev).add(path))
        setError('That folder no longer exists.')
        setBusy(false)
        return
      }
      await runJournalSwitch(path)
      finish(path) // overlay unmounts on the next render; leave busy = true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the journal.')
      setBusy(false)
    }
  }

  // Picker view: browse to an existing journal folder and open it directly.
  const handleBrowse = async () => {
    const picked = await pickJournalDirectory()
    if (!picked) return // user cancelled the native picker — stay put
    await handleOpen(picked)
  }

  // Create flow: pick the parent directory the new journal folder will live in.
  // Unlike handleBrowse, this only records the location — the folder is created
  // (and switched into) later by handleCreate.
  const handlePickParent = async () => {
    setError(null)
    const picked = await pickJournalDirectory()
    if (!picked) return // user cancelled the native picker — stay put
    setParent(picked)
  }

  // Create a new journal folder under the chosen parent, then switch into it.
  const handleCreate = async () => {
    if (!parent || !canContinueName || busy) return
    setBusy(true)
    setError(null)
    try {
      const newPath = `${parent}/${slug}`
      if (await journalPathExists(newPath)) {
        setError(`A folder named "${slug}" already exists here. Pick a different name or location.`)
        setBusy(false)
        return
      }
      await createJournalFolder(newPath)
      await grantFsScope(newPath)
      await runJournalSwitch(newPath)
      finish(newPath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the journal folder.')
      setBusy(false)
    }
  }

  const headingId = 'journal-launcher-heading'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'var(--warm-cream)', zIndex: 1100, padding: 24 }}
    >
      <div
        className="flex flex-col"
        style={{
          background: 'var(--parchment)', border: '1px solid var(--stone)',
          borderRadius: 'var(--radius-lg)', padding: '36px 40px',
          maxWidth: 480, width: '100%', gap: 20,
          boxShadow: '0 12px 40px var(--shadow-warm-deep)',
        }}
      >
        <img
          src={isDark ? nopyLogoDark : nopyLogo}
          alt="nopy"
          style={{ width: 56, height: 56, objectFit: 'contain', alignSelf: 'center' }}
        />

        {view === 'picker' && (
          <PickerView
            headingId={headingId}
            recents={recents}
            missing={missing}
            highlightedPath={highlightedPath}
            busy={busy}
            onOpen={handleOpen}
            onRemove={removeRecentJournal}
            onBrowse={handleBrowse}
            onCreate={() => { setError(null); setView('create-name') }}
          />
        )}

        {view === 'create-name' && (
          <div className="flex flex-col" style={{ gap: 14 }}>
            <h2 id={headingId} style={headingStyle}>Name your journal</h2>
            <p style={bodyStyle}>
              Give it a short name. You'll choose where to store it next, and a folder will be created there.
            </p>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canContinueName) setView('create-location') }}
              placeholder="e.g. travel-log-2026"
              style={inputStyle}
            />
            {slug && (
              <p style={{ ...bodyStyle, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--icon-muted)' }}>
                Folder: {slug}
              </p>
            )}
            <div className="flex" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <Button variant="secondary" onClick={() => setView('picker')}>
                <ArrowLeft size={14} strokeWidth={1.8} /> Back
              </Button>
              <Button variant="primary" onClick={() => setView('create-location')} disabled={!canContinueName}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {view === 'create-location' && (
          <div className="flex flex-col" style={{ gap: 14 }}>
            <h2 id={headingId} style={headingStyle}>Choose where to store it</h2>
            {finalPath ? (
              <>
                <p style={bodyStyle}>A new folder will be created at:</p>
                <p style={pathPreviewStyle}>{finalPath}</p>
                <button onClick={handlePickParent} className="cursor-pointer" style={linkButtonStyle}>
                  Choose a different folder…
                </button>
              </>
            ) : (
              <p style={bodyStyle}>Pick the location where your new journal folder should live.</p>
            )}
            {error && <ErrorRow message={error} />}
            <div className="flex" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <Button variant="secondary" onClick={() => { setError(null); setView('create-name') }}>
                <ArrowLeft size={14} strokeWidth={1.8} /> Back
              </Button>
              {finalPath ? (
                <Button variant="primary" onClick={handleCreate} disabled={busy}>
                  {busy ? 'Creating…' : 'Create journal'}
                </Button>
              ) : (
                <Button variant="primary" onClick={handlePickParent}>
                  <FolderOpen size={14} strokeWidth={1.8} /> Choose folder…
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface PickerViewProps {
  headingId: string
  recents: { path: string; name: string; lastOpenedAt: string }[]
  missing: Set<string>
  highlightedPath: string | null
  busy: boolean
  onOpen: (path: string) => void
  onRemove: (path: string) => void
  onBrowse: () => void
  onCreate: () => void
}

function PickerView({ headingId, recents, missing, highlightedPath, busy, onOpen, onRemove, onBrowse, onCreate }: PickerViewProps) {
  const hasRecents = recents.length > 0
  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <div className="flex flex-col" style={{ gap: 6, textAlign: 'center' }}>
        <h2 id={headingId} style={{ ...headingStyle, fontFamily: 'var(--font-title)', fontSize: 26 }}>
          {hasRecents ? 'Open a journal' : 'Welcome to nopy'}
        </h2>
        <p style={bodyStyle}>
          {hasRecents
            ? 'Pick up where you left off, or start a new journal.'
            : 'Create your first journal to start writing. Everything stays on your device.'}
        </p>
      </div>

      {hasRecents && (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {recents.map((j) => {
            const isMissing = missing.has(j.path)
            const isHighlighted = j.path === highlightedPath && !isMissing
            return (
              <div key={j.path} className="flex items-center" style={{ gap: 6 }}>
                <button
                  onClick={() => onOpen(j.path)}
                  disabled={isMissing || busy}
                  autoFocus={isHighlighted}
                  className="flex items-center cursor-pointer"
                  style={{
                    flex: 1, minWidth: 0, gap: 10, padding: '10px 12px', textAlign: 'left',
                    border: `1px solid ${isHighlighted ? 'var(--forest)' : 'var(--stone)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: isHighlighted ? 'var(--warm-cream)' : 'transparent',
                    opacity: isMissing ? 0.6 : 1,
                    cursor: isMissing ? 'not-allowed' : 'pointer',
                  }}
                >
                  <BookOpen size={16} strokeWidth={1.8} style={{ flexShrink: 0, color: 'var(--forest)' }} />
                  <span className="flex flex-col" style={{ minWidth: 0, gap: 1 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                      {j.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: isMissing ? 'var(--soft-coral)' : 'var(--icon-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {isMissing ? 'Folder not found' : j.path}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => onRemove(j.path)}
                  aria-label={`Remove ${j.name} from recent journals`}
                  className="flex items-center justify-center cursor-pointer"
                  style={{
                    flexShrink: 0, width: 30, height: 30, border: 'none',
                    background: 'transparent', color: 'var(--icon-muted)', borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <X size={15} strokeWidth={1.8} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex" style={{ gap: 10, justifyContent: hasRecents ? 'space-between' : 'center', marginTop: 2 }}>
        <Button variant="secondary" onClick={onBrowse} disabled={busy}>
          <FolderOpen size={14} strokeWidth={1.8} /> Open other folder…
        </Button>
        <Button variant="primary" onClick={onCreate} autoFocus={!hasRecents} disabled={busy}>
          <Plus size={14} strokeWidth={1.8} /> Create new journal
        </Button>
      </div>
    </div>
  )
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="flex items-center" style={{ gap: 8, color: 'var(--soft-coral)', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
      <AlertTriangle size={15} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      <span>{message}</span>
    </div>
  )
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)', margin: 0,
}

const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.6, margin: 0,
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 14, padding: '8px 12px',
  border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
  background: 'var(--warm-cream)', color: 'var(--ink)', outline: 'none',
}

const pathPreviewStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)',
  background: 'var(--warm-cream)', border: '1px solid var(--stone)',
  borderRadius: 'var(--radius-sm)', padding: '8px 12px', margin: 0,
  overflowWrap: 'anywhere',
}

const linkButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--forest)',
  background: 'transparent', border: 'none', padding: 0, textAlign: 'left', alignSelf: 'flex-start',
}

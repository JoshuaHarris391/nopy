import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'
import { useAutosave } from '../../hooks/useAutosave'
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea'
import { useCancellableTask } from '../../hooks/useCancellableTask'
import { useJournalIndex } from '../../hooks/useJournalIndex'
import { usePageSwipe } from '../../hooks/usePageSwipe'
import { format } from 'date-fns'
import { Check, Trash2, Loader2 } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { MoodBar } from '../ui/MoodBar'
import { DateTimePicker } from '../ui/DateTimePicker'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { RenameEntryDialog } from '../ui/RenameEntryDialog'
import { Button } from '../ui/Button'
import { EditorToolbar, TEXT_SIZES } from './EditorToolbar'
import { EntryNav } from './EntryNav'
import { useJournalStore } from '../../stores/journalStore'
import { useJournalNavStore } from '../../stores/journalNavStore'
import { useSettingsStore, selectLlmConfig } from '../../stores/settingsStore'
import { moodValueToLabel } from '../../utils/mood'
import { isLlmConfigured } from '../../services/llm'
import { FilenameExistsError } from '../../services/fs'
import { getJournalIndex, getNeighbours, monthOf, monthPath } from '../../services/journalBooks'
import type { JournalEntry, MoodScore } from '../../types/journal'

type FlipDirection = 'next' | 'prev'

export function EntryEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const entries = useJournalStore((s) => s.entries)
  const loaded = useJournalStore((s) => s.loaded)
  const loadEntries = useJournalStore((s) => s.loadEntries)
  const addEntry = useJournalStore((s) => s.addEntry)
  const updateEntry = useJournalStore((s) => s.updateEntry)
  const deleteEntry = useJournalStore((s) => s.deleteEntry)
  const reindexEntryFn = useJournalStore((s) => s.reindexEntry)
  const lastError = useJournalStore((s) => s.lastError)
  const clearLastError = useJournalStore((s) => s.clearLastError)
  const llmConfig = useSettingsStore(useShallow(selectLlmConfig))
  const index = useJournalIndex()
  const reindex = useCancellableTask<void>()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRename, setShowRename] = useState(false)
  // True when the current entry could not be written to disk because its title
  // collides with another entry. The entry then lives only in the in-memory
  // cache, so leaving the editor without resolving it would strand a phantom.
  const [unsavedToDisk, setUnsavedToDisk] = useState(false)
  const [showLeavePrompt, setShowLeavePrompt] = useState(false)

  const reindexReady = isLlmConfigured(llmConfig)

  // The route param is the single source of truth for which page is open.
  const currentId = id && id !== 'new' ? id : null
  const isNew = !currentId
  const [title, setTitle] = useState(isNew ? format(new Date(), 'yyyy-MM-dd') : '')
  const [content, setContent] = useState('')
  const [moodValue, setMoodValue] = useState<number | null>(null)
  const [createdAt, setCreatedAt] = useState<string>(() => new Date().toISOString())
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [textSizeIndex, setTextSizeIndex] = useState(3)
  const entryIdRef = useRef<string | null>(currentId)
  const isNewRef = useRef(isNew)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // Which entry the local form state currently reflects. Hydration runs only
  // when the route moves to a different entry, never on every store change.
  const hydratedIdRef = useRef<string | null>(null)
  // Saves are queued behind each other so a flush issued mid-write is never
  // dropped; `saving` below is purely for the header indicator.
  const inFlightRef = useRef<Promise<void>>(Promise.resolve())
  const flippingRef = useRef(false)
  const pageRef = useRef<HTMLDivElement | null>(null)
  // Incremented on every page turn so the page leaf remounts (and animates)
  // only then, not on the new-entry → saved-entry URL swap.
  const [turn, setTurn] = useState<{ n: number; direction: FlipDirection | null }>({ n: 0, direction: null })

  useEffect(() => {
    if (!loaded) loadEntries()
  }, [loaded, loadEntries])

  // Layout effect so a turned page never paints with the previous entry's text.
  useLayoutEffect(() => {
    if (!loaded || !currentId || hydratedIdRef.current === currentId) return
    const entry = entries.find((e) => e.id === currentId)
    if (!entry) return
    hydratedIdRef.current = currentId
    setTitle(entry.title)
    setContent(entry.content)
    setMoodValue(entry.mood?.value ?? null)
    setCreatedAt(entry.createdAt)
    entryIdRef.current = entry.id
    isNewRef.current = false
    autosave.markClean()
    setJustSaved(false)
    setUnsavedToDisk(false)
    setShowRename(false)
    setShowLeavePrompt(false)
    setShowDeleteConfirm(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, entries, loaded])

  const doPersist = useCallback(async (saveTitle: string) => {
    setSaving(true)
    try {
      const mood: MoodScore | null = moodValue
        ? { value: moodValue, label: moodValueToLabel(moodValue) }
        : null
      if (isNewRef.current && !entryIdRef.current?.match(/^[0-9a-f-]{36}$/)) {
        // Create the new entry under the user's real title in a single write.
        // Set the refs BEFORE the await: if the save collides (and throws), the
        // next autosave must not create a second entry — it should retry through
        // the updateEntry path against the entry we just added to the store.
        const newId = crypto.randomUUID()
        entryIdRef.current = newId
        isNewRef.current = false
        // The form already holds this entry, so the id-change hydration must
        // not overwrite keystrokes typed while the file is being written.
        hydratedIdRef.current = newId
        navigate(`/journal/${newId}`, { replace: true })
        const entry: JournalEntry = {
          id: newId,
          title: saveTitle,
          content,
          createdAt,
          updatedAt: new Date().toISOString(),
          mood,
          tags: [],
          summary: null,
          indexed: false,
        }
        await addEntry(entry)
      } else {
        await updateEntry(entryIdRef.current!, { title: saveTitle, content, mood, createdAt })
      }
      autosave.markClean()
      setUnsavedToDisk(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (e) {
      // A filename collision is recoverable: prompt the user for a new title
      // instead of logging a failure. The entry's file was not written, so the
      // colliding entry's content on disk is untouched.
      if (e instanceof FilenameExistsError) {
        // If the entry has no file on disk yet (a brand-new entry), it now lives
        // only in the cache — flag it so leaving the editor warns the user.
        const cur = useJournalStore.getState().entries.find((en) => en.id === entryIdRef.current)
        setUnsavedToDisk(!cur?.sourceFilename)
        setShowRename(true)
      } else {
        console.error('[editor] Save failed:', e)
      }
    } finally {
      setSaving(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addEntry, updateEntry, content, moodValue, createdAt, navigate])

  const persist = useCallback((saveTitle: string): Promise<void> => {
    const run = inFlightRef.current.then(() => doPersist(saveTitle))
    // Keep the chain alive after a rejection so later saves still queue.
    inFlightRef.current = run.catch(() => {})
    return run
  }, [doPersist])

  const handleSave = useCallback(() => persist(title), [persist, title])

  const autosave = useAutosave(handleSave, [title, content, moodValue, createdAt])

  const handleReindex = useCallback(() => {
    if (reindex.state === 'running') { reindex.abort(); return } // toggle = cancel
    if (!reindexReady) return
    reindex.run(async (_onProgress, signal) => {
      // Flush local edits first so the LLM indexes current content and
      // applyProcessedMetadata writes the up-to-date markdown to disk.
      autosave.cancelPending()
      await handleSave()
      const entryId = entryIdRef.current
      if (!entryId || signal.aborted) return
      await reindexEntryFn(entryId, llmConfig, signal)
      // The LLM may have assigned a mood; reflect it in the form.
      const fresh = useJournalStore.getState().entries.find((e) => e.id === entryId)
      if (fresh) setMoodValue(fresh.mood?.value ?? null)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reindex, reindexReady, llmConfig, handleSave])

  useKeyboardShortcut('mod+s', () => {
    autosave.cancelPending()
    handleSave()
  })

  useAutoResizeTextarea(textareaRef, content, [textSizeIndex])

  const neighbours = currentId ? getNeighbours(index, currentId) : { olderId: null, newerId: null }

  /**
   * Turn the page. Edits are flushed first, neighbours are recomputed after
   * the flush (a date edit may have moved this entry), and the navigation
   * replaces history so flicking through twenty pages still leaves a single
   * Back to the month scroll.
   */
  const flip = useCallback(async (dir: FlipDirection) => {
    if (!currentId || flippingRef.current || reindex.state === 'running') return
    if (unsavedToDisk) {
      autosave.cancelPending()
      setShowLeavePrompt(true)
      return
    }
    flippingRef.current = true
    try {
      await autosave.flush()
      const fresh = getNeighbours(getJournalIndex(useJournalStore.getState().entries), currentId)
      const target = dir === 'next' ? fresh.newerId : fresh.olderId
      if (!target) return
      setTurn((t) => ({ n: t.n + 1, direction: dir }))
      navigate(`/journal/${target}`, { replace: true })
    } finally {
      flippingRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, unsavedToDisk, reindex.state, navigate])

  useKeyboardShortcut('mod+[', () => { void flip('prev') })
  useKeyboardShortcut('mod+]', () => { void flip('next') })

  usePageSwipe(pageRef, {
    onNext: () => { void flip('next') },
    onPrev: () => { void flip('prev') },
    enabled: !!currentId && !showDeleteConfirm && !showLeavePrompt && !showRename,
  })

  /** Leave for the month this entry lives in, optionally marking its card. */
  const leaveToMonth = useCallback((reveal: boolean) => {
    if (reveal && entryIdRef.current) useJournalNavStore.getState().setRevealEntry(entryIdRef.current)
    navigate(monthPath(monthOf(createdAt)))
  }, [createdAt, navigate])

  const handleDelete = useCallback(async () => {
    const entryId = entryIdRef.current
    if (!entryId) return
    await deleteEntry(entryId)
    leaveToMonth(false)
  }, [deleteEntry, leaveToMonth])

  const handleClose = useCallback(async () => {
    // Don't let the user wander off leaving a cache-only entry that never made
    // it to disk — make them decide to discard it or go back and rename it.
    if (unsavedToDisk) {
      autosave.cancelPending()
      setShowLeavePrompt(true)
      return
    }
    await autosave.flush()
    if (!entryIdRef.current) {
      navigate('/journal')
      return
    }
    leaveToMonth(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsavedToDisk, navigate, leaveToMonth])

  const handleDiscardAndLeave = useCallback(async () => {
    setShowLeavePrompt(false)
    const entryId = entryIdRef.current
    if (entryId) await deleteEntry(entryId)
    leaveToMonth(false)
  }, [deleteEntry, leaveToMonth])

  const handleStartSession = useCallback(async () => {
    await autosave.flush()
    navigate('/chat', { state: { entryTitle: title, entryContent: content, entryDate: createdAt } })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, title, content, createdAt])

  const markFieldDirty = () => {
    autosave.markDirty()
    setJustSaved(false)
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length
  const readTime = Math.max(1, Math.ceil(wordCount / 200))
  const indexed = entries.find((e) => e.id === entryIdRef.current)?.indexed ?? false
  const canReindex = !isNewRef.current && !!entryIdRef.current && content.trim().length > 0
  const neighbour = (nid: string | null) => {
    if (!nid) return null
    const e = entries.find((en) => en.id === nid)
    return e ? { id: e.id, createdAt: e.createdAt } : null
  }
  const turnClass = turn.direction === 'next' ? 'page-enter-forward' : turn.direction === 'prev' ? 'page-enter-back' : ''

  return (
    <div ref={pageRef} className="flex-1 flex flex-col min-h-0" style={{ overscrollBehaviorX: 'none' }}>
      <MainHeader title={isNew ? 'New Entry' : 'Edit Entry'}>
        {saving && (
          <div className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)' }}>
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            Saving
          </div>
        )}
        {justSaved && !saving && (
          <div className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)' }}>
            <Check size={14} strokeWidth={2} />
            Saved
          </div>
        )}
        {!isNew && (
          <EntryNav
            prev={neighbour(neighbours.olderId)}
            next={neighbour(neighbours.newerId)}
            location={monthOf(createdAt)}
            disabled={reindex.state === 'running' || unsavedToDisk}
            onPrev={() => { void flip('prev') }}
            onNext={() => { void flip('next') }}
          />
        )}
        <Button variant="secondary" onClick={() => { void handleClose() }}>Close</Button>
        {!isNew && entryIdRef.current && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            aria-label="Delete entry"
            className="flex items-center justify-center cursor-pointer"
            style={{
              width: 32, height: 32, borderRadius: 'var(--radius-sm)',
              background: 'transparent', border: 'none', color: 'var(--soft-coral)',
              transition: 'all var(--transition-gentle)', opacity: 0.6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
          >
            <Trash2 size={16} strokeWidth={1.8} />
          </button>
        )}
      </MainHeader>

      {lastError && (
        <div
          className="flex items-center justify-between"
          style={{
            padding: '10px 44px',
            background: 'color-mix(in srgb, var(--soft-coral) 12%, var(--parchment))',
            borderBottom: '1px solid color-mix(in srgb, var(--soft-coral) 30%, var(--stone))',
            fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--soft-coral)',
          }}
        >
          <span>{lastError}</span>
          <button
            onClick={clearLastError}
            className="cursor-pointer"
            style={{
              background: 'none', border: 'none', color: 'var(--soft-coral)',
              fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500,
              textDecoration: 'underline', padding: '2px 8px',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* The page leaf: keyed per turn so it remounts (scrolled to top) and plays the turn. */}
      <div
        key={turn.n}
        className={`flex-1 overflow-y-auto ${turnClass}`}
        style={{ padding: '36px 44px 0 44px' }}
        onAnimationEnd={(e) => {
          // Drop the lingering transform once settled so this stays an ordinary scroller.
          if (e.target === e.currentTarget) setTurn((t) => ({ ...t, direction: null }))
        }}
      >
        <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto' }}>
          <input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); markFieldDirty() }}
            placeholder="What's on your mind today?"
            style={{
              fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700,
              color: 'var(--ink)', border: 'none', background: 'transparent',
              width: '100%', outline: 'none', letterSpacing: '-0.015em',
              padding: '0 0 8px', borderBottom: '2px solid transparent',
              transition: 'border-color var(--transition-gentle)', caretColor: 'var(--forest)',
            }}
            onFocus={(e) => (e.target.style.borderBottomColor = 'var(--amber)')}
            onBlur={(e) => (e.target.style.borderBottomColor = 'transparent')}
          />

          <MoodBar
            value={moodValue}
            onChange={(v) => { setMoodValue(v); markFieldDirty() }}
          />

          <div style={{ margin: '8px 0 28px' }}>
            <DateTimePicker
              value={createdAt}
              onChange={(iso) => { setCreatedAt(iso); markFieldDirty() }}
            />
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              markFieldDirty()
              // Only auto-scroll when appending at the end. Editing mid-document
              // means the user has chosen a scroll position deliberately.
              const el = e.target
              const isAppending =
                el.selectionStart === el.value.length &&
                el.selectionEnd === el.value.length
              if (!isAppending) return
              requestAnimationFrame(() => {
                const scrollParent = el.closest('.overflow-y-auto')
                if (!scrollParent) return
                const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 28
                const cursorY = el.offsetTop + el.scrollHeight - lineHeight
                const visibleBottom = scrollParent.scrollTop + scrollParent.clientHeight
                if (cursorY > visibleBottom - lineHeight * 2) {
                  scrollParent.scrollTop = cursorY - scrollParent.clientHeight + lineHeight * 3
                }
              })
            }}
            placeholder="Begin writing..."
            style={{
              fontFamily: 'var(--font-body)', fontSize: TEXT_SIZES[textSizeIndex],
              lineHeight: 1.8, color: 'var(--manuscript)', minHeight: 400,
              outline: 'none', border: 'none', width: '100%',
              background: 'transparent', resize: 'none',
              caretColor: 'var(--forest)', overflow: 'hidden',
            }}
          />

          <EditorToolbar
            wordCount={wordCount}
            readTime={readTime}
            textSizeIndex={textSizeIndex}
            onTextSizeChange={setTextSizeIndex}
            onStartSession={() => { void handleStartSession() }}
            indexed={indexed}
            reindexState={reindex.state}
            canReindex={canReindex}
            reindexReady={reindexReady}
            onReindex={handleReindex}
          />
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete this entry?"
        body="This will permanently delete the entry from the app and remove the Markdown file from your journal folder. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={showLeavePrompt}
        title="This entry isn't saved"
        body={`“${title}” is already used by another entry, so this entry hasn't been saved to your journal folder — it only exists in the app. Leave now and it will be discarded; go back to rename it and keep it.`}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={handleDiscardAndLeave}
        onCancel={() => setShowLeavePrompt(false)}
      />

      {showRename && (
        <RenameEntryDialog
          currentTitle={title}
          conflictTitle={title}
          onRename={(newTitle) => {
            setShowRename(false)
            setTitle(newTitle)
            void persist(newTitle)
          }}
          onCancel={() => {
            setShowRename(false)
            // Nothing was written to disk. Stop autosave from immediately
            // retrying the same colliding title; the next edit will retry.
            autosave.cancelPending()
            autosave.markClean()
          }}
        />
      )}
    </div>
  )
}

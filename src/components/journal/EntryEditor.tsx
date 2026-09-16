import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'
import { useAutosave } from '../../hooks/useAutosave'
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea'
import { useCancellableTask } from '../../hooks/useCancellableTask'
import { format } from 'date-fns'
import { Check, Trash2, Loader2 } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { MoodBar } from '../ui/MoodBar'
import { DateTimePicker } from '../ui/DateTimePicker'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { RenameEntryDialog } from '../ui/RenameEntryDialog'
import { Button } from '../ui/Button'
import { EditorToolbar, TEXT_SIZES } from './EditorToolbar'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore, selectLlmConfig } from '../../stores/settingsStore'
import { moodValueToLabel } from '../../utils/mood'
import { isLlmConfigured } from '../../services/llm'
import { FilenameExistsError } from '../../services/fs'
import type { JournalEntry, MoodScore } from '../../types/journal'

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
  const reindex = useCancellableTask<void>()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRename, setShowRename] = useState(false)
  // True when the current entry could not be written to disk because its title
  // collides with another entry. The entry then lives only in the in-memory
  // cache, so leaving the editor without resolving it would strand a phantom.
  const [unsavedToDisk, setUnsavedToDisk] = useState(false)
  const [showLeavePrompt, setShowLeavePrompt] = useState(false)

  const reindexReady = isLlmConfigured(llmConfig)

  const isNew = !id || id === 'new'
  const [title, setTitle] = useState(isNew ? format(new Date(), 'yyyy-MM-dd') : '')
  const [content, setContent] = useState('')
  const [moodValue, setMoodValue] = useState<number | null>(null)
  const [createdAt, setCreatedAt] = useState<string>(() => new Date().toISOString())
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [textSizeIndex, setTextSizeIndex] = useState(3)
  const entryIdRef = useRef<string | null>(id ?? null)
  const isNewRef = useRef(isNew)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!loaded) loadEntries()
  }, [loaded, loadEntries])

  useEffect(() => {
    if (!loaded) return
    if (id && id !== 'new') {
      const entry = entries.find((e) => e.id === id)
      if (entry) {
        setTitle(entry.title)
        setContent(entry.content)
        setMoodValue(entry.mood?.value ?? null)
        setCreatedAt(entry.createdAt)
        entryIdRef.current = entry.id
        isNewRef.current = false
        autosave.markClean()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, entries, loaded])

  const persist = useCallback(async (saveTitle: string) => {
    if (saving) return
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
        window.history.replaceState(null, '', `/journal/${newId}`)
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
  }, [saving, addEntry, updateEntry, content, moodValue, createdAt])

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
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reindex, reindexReady, llmConfig, handleSave])

  useKeyboardShortcut('mod+s', () => {
    autosave.cancelPending()
    handleSave()
  })

  useAutoResizeTextarea(textareaRef, content, [textSizeIndex])

  const handleDelete = useCallback(async () => {
    const entryId = entryIdRef.current
    if (!entryId) return
    await deleteEntry(entryId)
    navigate('/')
  }, [deleteEntry, navigate])

  const handleClose = useCallback(() => {
    // Don't let the user wander off leaving a cache-only entry that never made
    // it to disk — make them decide to discard it or go back and rename it.
    if (unsavedToDisk) {
      autosave.cancelPending()
      setShowLeavePrompt(true)
      return
    }
    navigate('/')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsavedToDisk, navigate])

  const handleDiscardAndLeave = useCallback(async () => {
    setShowLeavePrompt(false)
    const entryId = entryIdRef.current
    if (entryId) await deleteEntry(entryId)
    navigate('/')
  }, [deleteEntry, navigate])

  const markFieldDirty = () => {
    autosave.markDirty()
    setJustSaved(false)
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length
  const readTime = Math.max(1, Math.ceil(wordCount / 200))
  const indexed = entries.find((e) => e.id === entryIdRef.current)?.indexed ?? false
  const canReindex = !isNewRef.current && !!entryIdRef.current && content.trim().length > 0

  return (
    <>
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
        <Button variant="secondary" onClick={handleClose}>Close</Button>
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

      <div className="flex-1 overflow-y-auto" style={{ padding: '36px 44px 0 44px' }}>
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
            onStartSession={() => navigate('/chat', { state: { entryTitle: title, entryContent: content, entryDate: createdAt } })}
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
    </>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'
import { useAutosave } from '../../hooks/useAutosave'
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea'
import { format } from 'date-fns'
import { Check, Trash2, Loader2 } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { MoodBar } from '../ui/MoodBar'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Button } from '../ui/Button'
import { EditorToolbar, TEXT_SIZES } from './EditorToolbar'
import { useJournalStore } from '../../stores/journalStore'
import { moodValueToLabel } from '../../utils/mood'
import type { JournalEntry, MoodScore } from '../../types/journal'

export function EntryEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { entries, loaded, loadEntries, addEntry, updateEntry, deleteEntry, lastError, clearLastError } = useJournalStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isNew = !id || id === 'new'
  const [title, setTitle] = useState(isNew ? format(new Date(), 'yyyy-MM-dd') : '')
  const [content, setContent] = useState('')
  const [moodValue, setMoodValue] = useState<number | null>(null)
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
        entryIdRef.current = entry.id
        isNewRef.current = false
        autosave.markClean()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, entries, loaded])

  const ensureEntry = useCallback(async (): Promise<string> => {
    if (isNewRef.current && !entryIdRef.current?.match(/^[0-9a-f-]{36}$/)) {
      const newId = crypto.randomUUID()
      const now = new Date().toISOString()
      const entry: JournalEntry = {
        id: newId,
        title: format(new Date(), 'yyyy-MM-dd'),
        content: '',
        createdAt: now,
        updatedAt: now,
        mood: null,
        tags: [],
        summary: null,
        indexed: false,
      }
      await addEntry(entry)
      entryIdRef.current = newId
      isNewRef.current = false
      window.history.replaceState(null, '', `/journal/${newId}`)
      return newId
    }
    return entryIdRef.current!
  }, [addEntry])

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const entryId = await ensureEntry()
      const mood: MoodScore | null = moodValue
        ? { value: moodValue, label: moodValueToLabel(moodValue) }
        : null
      await updateEntry(entryId, { title, content, mood })
      autosave.markClean()
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (e) {
      console.error('[editor] Save failed:', e)
    } finally {
      setSaving(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, ensureEntry, updateEntry, title, content, moodValue])

  const autosave = useAutosave(handleSave, [title, content, moodValue])

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

  const markFieldDirty = () => {
    autosave.markDirty()
    setJustSaved(false)
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length
  const readTime = Math.max(1, Math.ceil(wordCount / 200))
  const entryDate = id && id !== 'new'
    ? entries.find((e) => e.id === id)?.createdAt
    : new Date().toISOString()

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
        <Button variant="secondary" onClick={() => navigate('/')}>Close</Button>
        {!isNew && entryIdRef.current && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
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

          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)', margin: '8px 0 28px' }}>
            {entryDate && format(new Date(entryDate), "d MMMM yyyy · EEEE · h:mm a")}
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              markFieldDirty()
              // Auto-scroll to keep cursor visible as text grows
              const el = e.target
              requestAnimationFrame(() => {
                const scrollParent = el.closest('.overflow-y-auto')
                if (scrollParent) {
                  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 28
                  const cursorY = el.offsetTop + el.scrollHeight - lineHeight
                  const visibleBottom = scrollParent.scrollTop + scrollParent.clientHeight
                  if (cursorY > visibleBottom - lineHeight * 2) {
                    scrollParent.scrollTop = cursorY - scrollParent.clientHeight + lineHeight * 3
                  }
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
            onStartSession={() => navigate('/chat', { state: { entryTitle: title, entryContent: content, entryDate } })}
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
    </>
  )
}

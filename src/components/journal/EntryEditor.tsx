import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { MessageCircle, Save, Check, Trash2 } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { Button } from '../ui/Button'
import { useJournalStore } from '../../stores/journalStore'
import type { JournalEntry } from '../../types/journal'

export function EntryEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { entries, loaded, loadEntries, addEntry, updateEntry, deleteEntry } = useJournalStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isNew = !id || id === 'new'
  const [title, setTitle] = useState(isNew ? format(new Date(), 'yyyy-MM-dd') : '')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const entryIdRef = useRef<string | null>(id ?? null)
  const isNewRef = useRef(isNew)

  // Load entries if not loaded
  useEffect(() => {
    if (!loaded) loadEntries()
  }, [loaded, loadEntries])

  // Load existing entry
  useEffect(() => {
    if (!loaded) return
    if (id && id !== 'new') {
      const entry = entries.find((e) => e.id === id)
      if (entry) {
        setTitle(entry.title)
        setContent(entry.content)
        entryIdRef.current = entry.id
        isNewRef.current = false
        setDirty(false)
      }
    }
  }, [id, entries, loaded])

  // Keyboard shortcut: Cmd+S / Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

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
      await updateEntry(entryId, { title, content })
      setDirty(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (e) {
      console.error('[editor] Save failed:', e)
    } finally {
      setSaving(false)
    }
  }, [saving, ensureEntry, updateEntry, title, content])

  const handleDelete = useCallback(async () => {
    const entryId = entryIdRef.current
    if (!entryId) return
    await deleteEntry(entryId)
    navigate('/')
  }, [deleteEntry, navigate])

  const handleTitleChange = (value: string) => {
    setTitle(value)
    setDirty(true)
    setJustSaved(false)
  }

  const handleContentChange = (value: string) => {
    setContent(value)
    setDirty(true)
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
        {/* Save indicator */}
        {justSaved && (
          <div
            className="flex items-center gap-1.5"
            style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)' }}
          >
            <Check size={14} strokeWidth={2} />
            Saved
          </div>
        )}
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving || (!dirty && !isNew)}
          style={{
            opacity: saving || (!dirty && !isNew) ? 0.5 : 1,
          }}
        >
          <Save size={14} strokeWidth={2} />
          {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Close
        </Button>
        {!isNew && entryIdRef.current && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center justify-center cursor-pointer"
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              border: 'none',
              color: 'var(--soft-coral)',
              transition: 'all var(--transition-gentle)',
              opacity: 0.6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
          >
            <Trash2 size={16} strokeWidth={1.8} />
          </button>
        )}
      </MainHeader>
      <div className="flex-1 overflow-y-auto" style={{ padding: '36px 44px' }}>
        <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto' }}>
          {/* Title input */}
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="What's on your mind today?"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 700,
              color: 'var(--ink)',
              border: 'none',
              background: 'transparent',
              width: '100%',
              outline: 'none',
              letterSpacing: '-0.015em',
              padding: '0 0 8px',
              borderBottom: '2px solid transparent',
              transition: 'border-color var(--transition-gentle)',
              caretColor: 'var(--forest)',
            }}
            onFocus={(e) => (e.target.style.borderBottomColor = 'var(--amber)')}
            onBlur={(e) => (e.target.style.borderBottomColor = 'transparent')}
          />

          {/* Date */}
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)', margin: '8px 0 28px' }}>
            {entryDate && format(new Date(entryDate), "d MMMM yyyy · EEEE · h:mm a")}
          </div>

          {/* Body textarea */}
          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Begin writing..."
            rows={20}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              lineHeight: 1.8,
              color: 'var(--manuscript)',
              minHeight: 400,
              outline: 'none',
              border: 'none',
              width: '100%',
              background: 'transparent',
              resize: 'none',
              caretColor: 'var(--forest)',
            }}
          />

          {/* Toolbar */}
          <div
            className="sticky bottom-0 flex justify-between items-center"
            style={{
              background: 'linear-gradient(to top, var(--parchment) 70%, transparent)',
              padding: '20px 0 8px',
            }}
          >
            <div className="flex gap-4" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)' }}>
              <span>{wordCount} words</span>
              <span>·</span>
              <span>~{readTime} min read</span>
            </div>
            <Button
              variant="primary"
              onClick={() => navigate('/chat', { state: { entryTitle: title, entryContent: content, entryDate } })}
              style={{ fontSize: 12, padding: '7px 14px' }}
            >
              <MessageCircle size={13} strokeWidth={1.8} />
              Explore with nopy
            </Button>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(44, 62, 44, 0.3)' }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="flex flex-col gap-4"
            style={{
              background: 'var(--parchment)',
              border: '1px solid var(--stone)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px 32px',
              maxWidth: 400,
              boxShadow: '0 12px 40px var(--shadow-warm-deep)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
              Delete this entry?
            </h3>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.6 }}>
              This will permanently delete the entry from the app and remove the Markdown file from your journal folder. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 cursor-pointer"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--soft-coral)',
                  color: 'white',
                  border: 'none',
                  transition: 'all var(--transition-gentle)',
                }}
              >
                <Trash2 size={14} strokeWidth={2} />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

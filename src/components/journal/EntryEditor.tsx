import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { MessageCircle } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { Button } from '../ui/Button'
import { useJournalStore } from '../../stores/journalStore'
import type { JournalEntry } from '../../types/journal'

export function EntryEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { entries, loaded, loadEntries, addEntry, updateEntry } = useJournalStore()

  const isNew = !id || id === 'new'
  const [title, setTitle] = useState(isNew ? format(new Date(), 'yyyy-MM-dd') : '')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const entryIdRef = useRef<string | null>(id ?? null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isNewRef = useRef(!id || id === 'new')

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
        setSaved(true)
      }
    }
  }, [id, entries, loaded])

  // Create new entry on first edit
  const ensureEntry = useCallback(async () => {
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
      // Replace URL without adding to history
      window.history.replaceState(null, '', `/journal/${newId}`)
      return newId
    }
    return entryIdRef.current!
  }, [addEntry])

  // Autosave with 2s debounce
  const scheduleSave = useCallback(
    (newTitle: string, newContent: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      setSaved(false)
      setSaving(false)

      saveTimeoutRef.current = setTimeout(async () => {
        setSaving(true)
        const entryId = await ensureEntry()
        await updateEntry(entryId, { title: newTitle, content: newContent })
        setSaving(false)
        setSaved(true)
      }, 2000)
    },
    [ensureEntry, updateEntry]
  )

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const handleTitleChange = (value: string) => {
    setTitle(value)
    scheduleSave(value, content)
  }

  const handleContentChange = (value: string) => {
    setContent(value)
    scheduleSave(title, value)
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length
  const readTime = Math.max(1, Math.ceil(wordCount / 200))
  const entryDate = id && id !== 'new'
    ? entries.find((e) => e.id === id)?.createdAt
    : new Date().toISOString()

  return (
    <>
      <MainHeader title={id && id !== 'new' ? 'Edit Entry' : 'New Entry'}>
        {/* Autosave indicator */}
        <div
          className="flex items-center gap-1.5"
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            color: saving ? 'var(--sage)' : saved ? 'var(--gentle-green)' : 'transparent',
          }}
        >
          {(saving || saved) && (
            <>
              <div
                className="rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  background: saving ? 'var(--sage)' : 'var(--gentle-green)',
                  animation: saving ? 'pulse 1s ease-in-out infinite' : 'pulse 2s ease-in-out infinite',
                }}
              />
              {saving ? 'Saving...' : 'Saved'}
            </>
          )}
        </div>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Close
        </Button>
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
              onClick={() => navigate('/chat')}
              style={{ fontSize: 12, padding: '7px 14px' }}
            >
              <MessageCircle size={13} strokeWidth={1.8} />
              Explore with nopy
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { MessageCircle, Check, Trash2, Loader2, Minus, Plus } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { Button } from '../ui/Button'
import { useJournalStore } from '../../stores/journalStore'
import type { JournalEntry, MoodScore, MoodLabel } from '../../types/journal'

function moodValueToLabel(value: number): MoodLabel {
  if (value >= 9) return 'great'
  if (value >= 7) return 'good'
  if (value >= 5) return 'neutral'
  if (value >= 3) return 'mixed'
  return 'low'
}

function getMoodColor(value: number): string {
  if (value >= 9) return 'var(--gentle-green)'
  if (value >= 7) return 'var(--sage)'
  if (value >= 5) return 'var(--dusk-blue)'
  if (value >= 3) return 'var(--amber)'
  return 'var(--soft-coral)'
}

function MoodBar({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0" style={{ padding: '12px 0 4px' }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--sage)', marginRight: 12, flexShrink: 0 }}>
        Mood
      </span>
      <div className="flex items-center flex-1" style={{ position: 'relative', maxWidth: 320 }}>
        {/* Connecting line */}
        <div
          className="absolute"
          style={{
            left: 10,
            right: 10,
            top: '50%',
            height: 2,
            background: 'var(--stone)',
            transform: 'translateY(-50%)',
            borderRadius: 1,
          }}
        />
        {/* Dots */}
        <div className="flex items-center justify-between w-full relative">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => {
            const isSelected = value === v
            const color = getMoodColor(v)
            return (
              <button
                key={v}
                onClick={() => onChange(v)}
                className="relative cursor-pointer flex items-center justify-center group"
                style={{
                  width: isSelected ? 22 : 14,
                  height: isSelected ? 22 : 14,
                  borderRadius: '50%',
                  background: isSelected ? color : `color-mix(in srgb, ${color} 30%, var(--warm-cream))`,
                  border: `2px solid ${isSelected ? color : `color-mix(in srgb, ${color} 50%, var(--stone))`}`,
                  transition: 'all var(--transition-gentle)',
                  zIndex: 1,
                  padding: 0,
                  boxShadow: isSelected ? `0 0 0 3px ${color}33` : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.width = '25px'
                    e.currentTarget.style.height = '25px'
                    e.currentTarget.style.background = `color-mix(in srgb, ${color} 55%, var(--warm-cream))`
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.width = '14px'
                    e.currentTarget.style.height = '14px'
                    e.currentTarget.style.background = `color-mix(in srgb, ${color} 30%, var(--warm-cream))`
                  }
                }}
                title={`${v}/10 — ${moodValueToLabel(v)}`}
              >
                {isSelected && (
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 8, fontWeight: 700, color: 'white', lineHeight: 1 }}>
                    {v}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      {value && (
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: getMoodColor(value), marginLeft: 12, flexShrink: 0, fontWeight: 500 }}>
          {value}/10
        </span>
      )}
    </div>
  )
}

export function EntryEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { entries, loaded, loadEntries, addEntry, updateEntry, deleteEntry } = useJournalStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isNew = !id || id === 'new'
  const [title, setTitle] = useState(isNew ? format(new Date(), 'yyyy-MM-dd') : '')
  const [content, setContent] = useState('')
  const [moodValue, setMoodValue] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const TEXT_SIZES = [14, 16, 18, 20, 22]
  const [textSizeIndex, setTextSizeIndex] = useState(3) // default 20px
  const entryIdRef = useRef<string | null>(id ?? null)
  const isNewRef = useRef(isNew)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const isTypingRef = useRef(false)

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
        setMoodValue(entry.mood?.value ?? null)
        entryIdRef.current = entry.id
        isNewRef.current = false
        setDirty(false)
      }
    }
  }, [id, entries, loaded])

  // Autosave with debounce
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!dirty) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      handleSave()
    }, 1500)
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [dirty, title, content, moodValue])

  // Keyboard shortcut: Cmd+S / Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
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
      const mood: MoodScore | null = moodValue
        ? { value: moodValue, label: moodValueToLabel(moodValue) }
        : null
      await updateEntry(entryId, { title, content, mood })
      setDirty(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (e) {
      console.error('[editor] Save failed:', e)
    } finally {
      setSaving(false)
    }
  }, [saving, ensureEntry, updateEntry, title, content, moodValue])

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
    isTypingRef.current = true
    setContent(value)
    setDirty(true)
    setJustSaved(false)
  }

  // Resize textarea only for external content changes (e.g. loading an entry)
  useEffect(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false
      return
    }
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.max(400, el.scrollHeight) + 'px'
    }
  }, [content, textSizeIndex])

  const wordCount = content.split(/\s+/).filter(Boolean).length
  const readTime = Math.max(1, Math.ceil(wordCount / 200))
  const entryDate = id && id !== 'new'
    ? entries.find((e) => e.id === id)?.createdAt
    : new Date().toISOString()

  return (
    <>
      <MainHeader title={isNew ? 'New Entry' : 'Edit Entry'}>
        {/* Autosave indicator */}
        {saving && (
          <div
            className="flex items-center gap-1.5"
            style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)' }}
          >
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            Saving
          </div>
        )}
        {justSaved && !saving && (
          <div
            className="flex items-center gap-1.5"
            style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)' }}
          >
            <Check size={14} strokeWidth={2} />
            Saved
          </div>
        )}
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
      <div className="flex-1 overflow-y-auto" style={{ padding: '36px 44px 0 44px' }}>
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

          {/* Mood bar */}
          <MoodBar
            value={moodValue}
            onChange={(v) => {
              setMoodValue(v)
              setDirty(true)
              setJustSaved(false)
            }}
          />

          {/* Date */}
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)', margin: '8px 0 28px' }}>
            {entryDate && format(new Date(entryDate), "d MMMM yyyy · EEEE · h:mm a")}
          </div>

          {/* Body textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              handleContentChange(e.target.value)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = Math.max(400, el.scrollHeight) + 'px'
              // Auto-scroll to keep cursor visible as text grows
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
              fontFamily: 'var(--font-body)',
              fontSize: TEXT_SIZES[textSizeIndex],
              lineHeight: 1.8,
              color: 'var(--manuscript)',
              minHeight: 400,
              outline: 'none',
              border: 'none',
              width: '100%',
              background: 'transparent',
              resize: 'none',
              caretColor: 'var(--forest)',
              overflow: 'hidden',
            }}
          />

          {/* Toolbar */}
          <div
            className="sticky bottom-0 flex justify-between items-center"
            style={{
              background: 'linear-gradient(to top, var(--parchment) 70%, transparent)',
              padding: '20px 0 16px',
            }}
          >
            <div className="flex items-center gap-4" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)' }}>
              <span>{wordCount} words</span>
              <span>·</span>
              <span>~{readTime} min read</span>
              <span>·</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTextSizeIndex((i) => Math.max(0, i - 1))}
                  disabled={textSizeIndex === 0}
                  className="flex items-center justify-center cursor-pointer"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    border: '1px solid var(--stone)',
                    color: textSizeIndex === 0 ? 'var(--stone)' : 'var(--sage)',
                    transition: 'all var(--transition-gentle)',
                    cursor: textSizeIndex === 0 ? 'default' : 'pointer',
                    padding: 0,
                  }}
                  title="Decrease text size"
                >
                  <Minus size={11} strokeWidth={2} />
                </button>
                <span style={{ minWidth: 18, textAlign: 'center', fontSize: 11 }}>
                  {TEXT_SIZES[textSizeIndex]}
                </span>
                <button
                  onClick={() => setTextSizeIndex((i) => Math.min(TEXT_SIZES.length - 1, i + 1))}
                  disabled={textSizeIndex === TEXT_SIZES.length - 1}
                  className="flex items-center justify-center cursor-pointer"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    border: '1px solid var(--stone)',
                    color: textSizeIndex === TEXT_SIZES.length - 1 ? 'var(--stone)' : 'var(--sage)',
                    transition: 'all var(--transition-gentle)',
                    cursor: textSizeIndex === TEXT_SIZES.length - 1 ? 'default' : 'pointer',
                    padding: 0,
                  }}
                  title="Increase text size"
                >
                  <Plus size={11} strokeWidth={2} />
                </button>
              </div>
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

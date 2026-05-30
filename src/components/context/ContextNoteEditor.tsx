import { useState, useEffect, useRef } from 'react'
import { Button } from '../ui/Button'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'
import type { ContextNote } from '../../types/context'

interface ContextNoteEditorProps {
  /** Existing note to edit, or null to create a new one. */
  note: ContextNote | null
  onSave: (data: { title: string; content: string; tags: string[] }) => void
  onClose: () => void
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--stone)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--warm-cream)',
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  padding: '9px 13px',
}

/**
 * Modal markdown editor for a context note (title + body + tags). The caller
 * mounts this only when open, with a `key` per note id, so initial state comes
 * straight from props — no syncing effect needed.
 */
export function ContextNoteEditor({ note, onSave, onClose }: ContextNoteEditorProps) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [tagsInput, setTagsInput] = useState(note?.tags.join(', ') ?? '')
  const titleRef = useRef<HTMLInputElement>(null)

  // Focus the title on open. No setState here, so this is a side-effect-only effect.
  useEffect(() => { titleRef.current?.focus() }, [])

  useKeyboardShortcut('escape', onClose)

  const save = () => {
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    onSave({ title: title.trim() || 'Untitled', content, tags })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={note ? 'Edit context note' : 'New context note'}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(44, 62, 44, 0.3)', padding: 24 }}
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full"
        style={{
          gap: 14, maxWidth: 640, maxHeight: '85vh',
          background: 'var(--parchment)', border: '1px solid var(--stone)',
          borderRadius: 'var(--radius-lg)', padding: '24px 28px',
          boxShadow: '0 12px 40px var(--shadow-warm-deep)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
          {note ? 'Edit note' : 'New context note'}
        </h3>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. My relationship with Dad)"
          style={fieldStyle}
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write anything you want your companion to know — past relationships, childhood, breakthroughs, values…"
          style={{ ...fieldStyle, minHeight: 220, resize: 'vertical', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
        />

        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="Tags, comma-separated (optional) — childhood, relationships"
          style={fieldStyle}
        />
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--sage)', margin: 0 }}>
          Tags help you organise — they are never sent to the model.
        </p>

        <div className="flex gap-2 justify-end" style={{ marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  )
}

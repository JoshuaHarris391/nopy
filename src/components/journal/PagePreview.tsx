import { useRef } from 'react'
import { MoodBar } from '../ui/MoodBar'
import { DateTimePicker } from '../ui/DateTimePicker'
import { TEXT_SIZES } from './EditorToolbar'
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea'
import type { JournalEntry } from '../../types/journal'

interface PagePreviewProps {
  entry: JournalEntry
  textSizeIndex: number
}

/**
 * A neighbouring diary page as it will look once turned to. Built from the
 * same elements as the editor page (a read-only input and textarea with the
 * editor's exact styles and the same auto-resize), so every measurement
 * matches and the swap from preview to live editor after a turn is invisible.
 * The carousel marks the slot inert, so nothing here can take focus.
 */
export function PagePreview({ entry, textSizeIndex }: PagePreviewProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  useAutoResizeTextarea(textareaRef, entry.content, [textSizeIndex])

  return (
    <div className="h-full overflow-hidden" style={{ padding: '36px 44px 0 44px', pointerEvents: 'none' }}>
      <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto' }}>
        <input
          type="text"
          readOnly
          tabIndex={-1}
          value={entry.title}
          placeholder="What's on your mind today?"
          style={{
            fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700,
            color: 'var(--ink)', border: 'none', background: 'transparent',
            width: '100%', outline: 'none', letterSpacing: '-0.015em',
            padding: '0 0 8px', borderBottom: '2px solid transparent',
          }}
        />

        <MoodBar value={entry.mood?.value ?? null} onChange={() => {}} />

        <div style={{ margin: '8px 0 28px' }}>
          <DateTimePicker value={entry.createdAt} onChange={() => {}} />
        </div>

        <textarea
          ref={textareaRef}
          readOnly
          tabIndex={-1}
          value={entry.content}
          placeholder="Begin writing..."
          style={{
            fontFamily: 'var(--font-body)', fontSize: TEXT_SIZES[textSizeIndex],
            lineHeight: 1.8, color: 'var(--manuscript)', minHeight: 400,
            outline: 'none', border: 'none', width: '100%',
            background: 'transparent', resize: 'none',
            caretColor: 'transparent', overflow: 'hidden',
          }}
        />
      </div>
    </div>
  )
}

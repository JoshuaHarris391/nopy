import { useEffect, useRef } from 'react'
import { marked } from 'marked'
import { Button } from '../ui/Button'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'

interface ContextItemViewerProps {
  /** Card title, shown as the modal heading. */
  title: string
  /** The rendered markdown block this card injects into the prompt. */
  markdown: string
  /** Label for the button that opens the card's full page (e.g. "Open Profile page"). */
  fullPageLabel: string
  onOpenFull: () => void
  onClose: () => void
}

/**
 * Read-only modal that shows the exact markdown a system context card (the
 * psychological profile or the journal index) contributes to the companion's
 * prompt. Mirrors `ContextNoteEditor`'s viewing experience for notes, but the
 * content is system-generated so it cannot be edited here — instead a button
 * jumps to the card's full page (Profile / Index), which owns generation.
 */
export function ContextItemViewer({ title, markdown, fullPageLabel, onOpenFull, onClose }: ContextItemViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  // Focus the close button on open so Escape/Enter work without a click first.
  useEffect(() => { closeRef.current?.focus() }, [])

  useKeyboardShortcut('escape', onClose)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(44, 62, 44, 0.3)', padding: 24 }}
      onClick={onClose}
    >
      <style>{`
        .context-markdown h1 { font-family: var(--font-display); font-size: 24px; font-weight: 600; color: var(--ink); margin: 24px 0 14px; line-height: 1.3; }
        .context-markdown h2 { font-family: var(--font-heading); font-size: 19px; font-weight: 500; color: var(--ink); margin: 22px 0 10px; line-height: 1.4; }
        .context-markdown h2:first-child { margin-top: 0; }
        .context-markdown h3 { font-family: var(--font-heading); font-size: 15px; font-weight: 500; color: var(--bark); margin: 18px 0 8px; line-height: 1.4; }
        .context-markdown p { margin: 0 0 12px; }
        .context-markdown ul, .context-markdown ol { margin: 0 0 12px; padding-left: 22px; }
        .context-markdown li { margin-bottom: 4px; }
        .context-markdown blockquote { border-left: 3px solid var(--amber); padding: 8px 16px; margin: 14px 0; color: var(--bark); font-style: italic; background: var(--warm-cream); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
        .context-markdown strong { font-weight: 600; color: var(--ink); }
        .context-markdown hr { border: none; border-top: 1px solid var(--stone); margin: 20px 0; }
        .context-markdown table { border-collapse: collapse; width: 100%; margin: 0 0 12px; font-size: 13px; }
        .context-markdown th, .context-markdown td { border: 1px solid var(--stone); padding: 6px 10px; text-align: left; vertical-align: top; }
        .context-markdown th { background: var(--warm-cream); font-weight: 600; color: var(--ink); }
      `}</style>
      <div
        className="flex flex-col w-full"
        style={{
          gap: 14, maxWidth: 680, maxHeight: '85vh',
          background: 'var(--parchment)', border: '1px solid var(--stone)',
          borderRadius: 'var(--radius-lg)', padding: '24px 28px',
          boxShadow: '0 12px 40px var(--shadow-warm-deep)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
          {title}
        </h3>

        <div
          className="context-markdown flex-1 overflow-y-auto"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14.5,
            lineHeight: 1.7,
            color: 'var(--manuscript)',
          }}
          dangerouslySetInnerHTML={{ __html: marked.parse(markdown.trimStart()) as string }}
        />

        <div className="flex gap-2 justify-end" style={{ marginTop: 4 }}>
          <Button variant="secondary" onClick={onOpenFull}>{fullPageLabel}</Button>
          <Button ref={closeRef} variant="primary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

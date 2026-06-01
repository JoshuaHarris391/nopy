import { Minus, Plus, MessageCircle, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import type { TaskState } from '../../hooks/useCancellableTask'

const TEXT_SIZES = [14, 16, 18, 20, 22]

interface EditorToolbarProps {
  wordCount: number
  readTime: number
  textSizeIndex: number
  onTextSizeChange: (index: number) => void
  onStartSession: () => void
  indexed: boolean
  reindexState: TaskState
  canReindex: boolean
  reindexReady: boolean
  onReindex: () => void
}

export function EditorToolbar({
  wordCount,
  readTime,
  textSizeIndex,
  onTextSizeChange,
  onStartSession,
  indexed,
  reindexState,
  canReindex,
  reindexReady,
  onReindex,
}: EditorToolbarProps) {
  const reindexing = reindexState === 'running'
  const reindexDisabled = !canReindex || !reindexReady
  const reindexTitle = !reindexReady
    ? 'Configure an AI provider in Settings to index entries'
    : !canReindex
      ? 'Save the entry with some content before indexing'
      : reindexing
        ? 'Stop indexing'
        : indexed
          ? 'Re-index this entry'
          : 'Index this entry'

  return (
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
            onClick={() => onTextSizeChange(Math.max(0, textSizeIndex - 1))}
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
            aria-label="Decrease text size"
          >
            <Minus size={11} strokeWidth={2} />
          </button>
          <span style={{ minWidth: 18, textAlign: 'center', fontSize: 11 }}>
            {TEXT_SIZES[textSizeIndex]}
          </span>
          <button
            onClick={() => onTextSizeChange(Math.min(TEXT_SIZES.length - 1, textSizeIndex + 1))}
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
            aria-label="Increase text size"
          >
            <Plus size={11} strokeWidth={2} />
          </button>
        </div>
        <span>·</span>
        <div
          className="flex items-center gap-1.5"
          title={indexed ? 'This entry has been indexed' : 'This entry has not been indexed yet'}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: indexed ? 'var(--gentle-green)' : 'var(--stone)',
              flexShrink: 0,
            }}
          />
          <span>{indexed ? 'Indexed' : 'Not indexed'}</span>
        </div>
        <button
          onClick={onReindex}
          disabled={reindexDisabled}
          className="flex items-center justify-center"
          style={{
            height: 22,
            padding: '0 8px',
            gap: 4,
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            border: '1px solid var(--stone)',
            color: reindexDisabled ? 'var(--stone)' : 'var(--sage)',
            fontFamily: 'var(--font-ui)',
            fontSize: 11,
            transition: 'all var(--transition-gentle)',
            cursor: reindexDisabled ? 'default' : 'pointer',
          }}
          title={reindexTitle}
          aria-label={reindexTitle}
        >
          {reindexing
            ? <Loader2 size={11} strokeWidth={2} className="animate-spin" />
            : <RefreshCw size={11} strokeWidth={2} />}
          {reindexing ? 'Indexing' : indexed ? 'Re-index' : 'Index'}
        </button>
        {reindexState === 'error' && (
          <span style={{ color: 'var(--soft-coral)', fontWeight: 500 }}>Failed</span>
        )}
        {reindexState === 'done' && (
          <span style={{ color: 'var(--gentle-green)', fontWeight: 500 }}>Indexed</span>
        )}
      </div>
      <Button
        variant="primary"
        onClick={onStartSession}
        style={{ fontSize: 12, padding: '7px 14px' }}
      >
        <MessageCircle size={13} strokeWidth={1.8} />
        Start Session
      </Button>
    </div>
  )
}

export { TEXT_SIZES }

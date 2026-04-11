import { Minus, Plus, MessageCircle } from 'lucide-react'
import { Button } from '../ui/Button'

const TEXT_SIZES = [14, 16, 18, 20, 22]

interface EditorToolbarProps {
  wordCount: number
  readTime: number
  textSizeIndex: number
  onTextSizeChange: (index: number) => void
  onStartSession: () => void
}

export function EditorToolbar({ wordCount, readTime, textSizeIndex, onTextSizeChange, onStartSession }: EditorToolbarProps) {
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

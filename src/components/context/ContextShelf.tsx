import { Target, List, FileText, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { ResolvedContextItem, ContextItemKind } from '../../types/context'

const KIND_ICON: Record<ContextItemKind, React.ElementType> = {
  profile: Target,
  index: List,
  note: FileText,
}

interface ContextShelfProps {
  /** Injected items, already sorted by order. */
  items: ResolvedContextItem[]
  onMove: (id: string, direction: 'left' | 'right') => void
  onRemove: (id: string) => void
}

/** The shelf: a horizontal, ordered row of injected cards (left = injected first). */
export function ContextShelf({ items, onMove, onRemove }: ContextShelfProps) {
  if (items.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-center"
        style={{
          minHeight: 96,
          border: '1.5px dashed var(--stone)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 24px',
          fontFamily: 'var(--font-ui)',
          fontSize: 13,
          color: 'var(--sage)',
          background: 'var(--warm-cream)',
        }}
      >
        Nothing injected — your companion starts with a blank slate. Add cards from below.
      </div>
    )
  }

  return (
    <div
      className="flex items-stretch overflow-x-auto"
      style={{
        gap: 12,
        padding: '12px 2px 14px',
        borderBottom: '1px solid var(--stone)',
        boxShadow: '0 6px 10px -10px var(--shadow-warm-deep)',
      }}
    >
      {items.map((item, i) => (
        <ShelfCard
          key={item.id}
          item={item}
          order={i + 1}
          isFirst={i === 0}
          isLast={i === items.length - 1}
          onMove={onMove}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

function ShelfCard({
  item, order, isFirst, isLast, onMove, onRemove,
}: {
  item: ResolvedContextItem
  order: number
  isFirst: boolean
  isLast: boolean
  onMove: (id: string, direction: 'left' | 'right') => void
  onRemove: (id: string) => void
}) {
  const Icon = KIND_ICON[item.kind]

  return (
    <div
      className="relative flex flex-col flex-shrink-0 overflow-hidden"
      style={{
        width: 168,
        background: 'var(--parchment)',
        border: '1px solid var(--forest)',
        borderLeft: '3px solid var(--forest)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        boxShadow: '0 2px 10px var(--shadow-warm)',
      }}
    >
      {/* Header: order pill + icon + remove */}
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span
          className="flex items-center justify-center"
          style={{
            minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
            background: 'var(--forest)', color: 'white',
            fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
          }}
        >
          {order}
        </span>
        <Icon size={15} strokeWidth={1.6} style={{ color: 'var(--forest)' }} />
        <button
          aria-label="Remove from context"
          onClick={() => onRemove(item.id)}
          className="flex items-center justify-center cursor-pointer"
          style={{ width: 20, height: 20, border: 'none', background: 'transparent', color: 'var(--icon-muted)', borderRadius: 'var(--radius-sm)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--soft-coral)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--icon-muted)')}
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>

      {/* Title */}
      <div
        style={{
          fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 500, color: 'var(--ink)',
          lineHeight: 1.3, marginBottom: 4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {item.title}
      </div>

      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10.5, color: item.available ? 'var(--sage)' : 'var(--soft-coral)' }}>
        {item.available ? `~${item.tokenEstimate.toLocaleString()} tok` : 'no data yet'}
      </span>

      {/* Footer: move controls */}
      <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
        <button
          aria-label="Move earlier"
          disabled={isFirst}
          onClick={() => onMove(item.id, 'left')}
          className="flex items-center justify-center"
          style={{
            width: 26, height: 22, borderRadius: 'var(--radius-sm)', border: '1px solid var(--stone)',
            background: 'var(--warm-cream)', color: isFirst ? 'var(--stone)' : 'var(--forest)',
            cursor: isFirst ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
        <button
          aria-label="Move later"
          disabled={isLast}
          onClick={() => onMove(item.id, 'right')}
          className="flex items-center justify-center"
          style={{
            width: 26, height: 22, borderRadius: 'var(--radius-sm)', border: '1px solid var(--stone)',
            background: 'var(--warm-cream)', color: isLast ? 'var(--stone)' : 'var(--forest)',
            cursor: isLast ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Target, List, FileText, X } from 'lucide-react'
import type { ResolvedContextItem, ContextItemKind } from '../../types/context'

const KIND_ICON: Record<ContextItemKind, React.ElementType> = {
  profile: Target,
  index: List,
  note: FileText,
}

interface ContextShelfProps {
  /** Injected item ids, in order. */
  ids: string[]
  byId: Map<string, ResolvedContextItem>
  onRemove: (id: string) => void
}

/**
 * The shelf droppable: a horizontal, ordered row of injected cards. Drop a note
 * here (from the grid) to inject it; drag a card off to remove it; reorder by
 * dragging within. Rendered inside ContextView's DndContext.
 */
export function ContextShelf({ ids, byId, onRemove }: ContextShelfProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'shelf' })

  return (
    <div style={{ borderBottom: '1px solid var(--stone)' }}>
      <div
        ref={setNodeRef}
        className="flex items-stretch"
        style={{
          gap: 12,
          flexWrap: 'nowrap',
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '8px 16px 16px',
          margin: '0 -16px',
          minHeight: 116,
          background: isOver ? 'rgba(91, 127, 94, 0.08)' : 'transparent',
          borderRadius: 'var(--radius-md)',
          transition: 'background 150ms ease',
        }}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          {ids.length === 0 ? (
            <ShelfPlaceholder isOver={isOver} />
          ) : (
            ids.map((id, i) => {
              const item = byId.get(id)
              return item ? <SortableShelfCard key={id} item={item} order={i + 1} onRemove={onRemove} /> : null
            })
          )}
        </SortableContext>
      </div>
    </div>
  )
}

function ShelfPlaceholder({ isOver }: { isOver: boolean }) {
  return (
    <div
      className="flex items-center justify-center text-center flex-1"
      style={{
        minHeight: 92,
        border: '1.5px dashed var(--stone)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 24px',
        fontFamily: 'var(--font-ui)',
        fontSize: 13,
        color: isOver ? 'var(--forest)' : 'var(--sage)',
        background: 'var(--warm-cream)',
      }}
    >
      {isOver ? 'Drop to inject into chat' : 'Nothing injected — drag a card here, or use its Add button.'}
    </div>
  )
}

function SortableShelfCard({ item, order, onRemove }: { item: ResolvedContextItem; order: number; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'none',
        cursor: 'grab',
        flexShrink: 0,
      }}
    >
      <ShelfCardView item={item} order={order} onRemove={onRemove} />
    </div>
  )
}

interface ShelfCardViewProps {
  item: ResolvedContextItem
  order: number
  onRemove?: (id: string) => void
  /** True in the DragOverlay — lifted shadow. */
  dragging?: boolean
}

/** Presentational shelf card (used in the row and the drag overlay). */
export function ShelfCardView({ item, order, onRemove, dragging = false }: ShelfCardViewProps) {
  const Icon = KIND_ICON[item.kind]
  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        width: 168,
        background: 'var(--parchment)',
        border: '1px solid var(--forest)',
        borderLeft: '3px solid var(--forest)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        boxShadow: dragging ? '0 12px 26px var(--shadow-warm-deep)' : '0 1px 4px var(--shadow-warm)',
      }}
    >
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
        {onRemove ? (
          <button
            aria-label="Remove from context"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRemove(item.id)}
            className="flex items-center justify-center cursor-pointer"
            style={{ width: 20, height: 20, border: 'none', background: 'transparent', color: 'var(--icon-muted)', borderRadius: 'var(--radius-sm)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--soft-coral)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--icon-muted)')}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        ) : (
          <span style={{ width: 20, height: 20 }} />
        )}
      </div>

      <div
        style={{
          fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 500, color: 'var(--ink)',
          lineHeight: 1.3, marginBottom: 4,
          // Reserve two lines so every shelf card is the same height regardless
          // of whether its title wraps to one line or two.
          height: '2.6em',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {item.title}
      </div>

      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10.5, color: item.available ? 'var(--sage)' : 'var(--soft-coral)' }}>
        {item.available ? `~${item.tokenEstimate.toLocaleString()} tok` : 'no data yet'}
      </span>
    </div>
  )
}

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Target, List, FileText, Plus, Trash2 } from 'lucide-react'
import type { ResolvedContextItem, ContextItemKind } from '../../types/context'

const KIND_ICON: Record<ContextItemKind, React.ElementType> = {
  profile: Target,
  index: List,
  note: FileText,
}

function previewText(item: ResolvedContextItem): string {
  if (item.kind === 'note') return item.content || 'Empty note'
  if (item.kind === 'profile') {
    return item.available
      ? 'Your generated psychological profile and recurring themes.'
      : 'Generate your profile (Profile tab) to use it as context.'
  }
  return item.available
    ? 'A table of your most recent indexed journal entries.'
    : 'Index your journal entries (Index tab) to use them as context.'
}

interface GridCardViewProps {
  item: ResolvedContextItem
  onAdd?: () => void
  onEdit?: () => void
  onDelete?: () => void
  /** True when rendered inside the DragOverlay — gives the lifted shadow. */
  dragging?: boolean
}

/** Presentational square tile for the Available grid (and the drag overlay). */
export function GridCardView({ item, onAdd, onEdit, onDelete, dragging = false }: GridCardViewProps) {
  const Icon = KIND_ICON[item.kind]
  const [hovered, setHovered] = useState(false)
  const disabled = !item.available

  const boxShadow = dragging
    ? '0 14px 30px var(--shadow-warm-deep)'
    : hovered && !disabled
      ? '0 6px 22px var(--shadow-warm-hover)'
      : '0 2px 8px var(--shadow-warm)'

  return (
    <div
      className="relative flex flex-col aspect-square overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => { if (item.editable && onEdit) onEdit() }}
      style={{
        background: 'var(--parchment)',
        border: '1px solid var(--stone)',
        borderRadius: 'var(--radius-md)',
        padding: 16,
        cursor: item.editable ? 'pointer' : 'default',
        opacity: disabled ? 0.55 : 1,
        boxShadow,
        transform: !dragging && hovered && !disabled ? 'translateY(-2px)' : 'translateY(0)',
        borderColor: hovered && !disabled ? 'var(--sage)' : 'var(--stone)',
        transition: 'box-shadow var(--transition-gentle), transform var(--transition-gentle), border-color var(--transition-gentle)',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <Icon size={18} strokeWidth={1.6} style={{ color: 'var(--forest)', flexShrink: 0 }} />
        {item.editable && onDelete && (
          <button
            aria-label="Delete note"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="flex items-center justify-center cursor-pointer"
            style={{
              width: 24, height: 24, border: 'none', background: 'transparent',
              color: 'var(--icon-muted)', borderRadius: 'var(--radius-sm)',
              opacity: hovered ? 1 : 0, transition: 'opacity 150ms ease, color 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--soft-coral)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--icon-muted)')}
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>

      <div
        style={{
          fontFamily: 'var(--font-heading)', fontSize: 14.5, fontWeight: 500,
          color: 'var(--ink)', lineHeight: 1.3, marginBottom: 6,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {item.title}
      </div>

      <div
        className="flex-1"
        style={{
          fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--manuscript)',
          opacity: 0.7, lineHeight: 1.5, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
        }}
      >
        {previewText(item)}
      </div>

      <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--sage)' }}>
          ~{item.tokenEstimate.toLocaleString()} tok
        </span>
        {onAdd && (
          <button
            disabled={disabled}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (!disabled) onAdd() }}
            className="flex items-center"
            style={{
              gap: 4, fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 500,
              padding: '4px 10px', borderRadius: 'var(--radius-sm)',
              background: disabled ? 'transparent' : 'var(--warm-cream)',
              border: '1px solid var(--stone)', color: disabled ? 'var(--sage)' : 'var(--forest)',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <Plus size={12} strokeWidth={2} /> Add
          </button>
        )}
      </div>
    </div>
  )
}

interface SortableGridCardProps {
  item: ResolvedContextItem
  onAdd: () => void
  onEdit?: () => void
  onDelete?: () => void
}

/** Draggable wrapper: drag a tile onto the shelf to inject it. */
export function SortableGridCard({ item, onAdd, onEdit, onDelete }: SortableGridCardProps) {
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
      }}
    >
      <GridCardView item={item} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

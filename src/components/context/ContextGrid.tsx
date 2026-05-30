import { useDroppable } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { SortableGridCard, GridCardView } from './ContextCard'
import type { ResolvedContextItem } from '../../types/context'

interface ContextGridProps {
  /** Available items that can be dragged onto the shelf. */
  draggable: ResolvedContextItem[]
  /** Available items with no data yet (dimmed, not draggable). */
  staticItems: ResolvedContextItem[]
  onNewNote: () => void
  onAdd: (id: string) => void
  onEdit: (id: string) => void
  onView: (id: string) => void
  onDelete: (id: string) => void
}

/**
 * The Available grid droppable: a responsive grid of square tiles. Dragging a
 * tile out of here and onto the shelf injects it; dragging a shelf card back
 * here removes it. Rendered inside ContextView's DndContext.
 */
export function ContextGrid({ draggable, staticItems, onNewNote, onAdd, onEdit, onView, onDelete }: ContextGridProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'grid' })

  return (
    <div
      ref={setNodeRef}
      className="grid gap-3"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        background: isOver ? 'rgba(91, 127, 94, 0.06)' : 'transparent',
        borderRadius: 'var(--radius-md)',
        transition: 'background 150ms ease',
      }}
    >
      <NewNoteTile onClick={onNewNote} />
      <SortableContext items={draggable.map((i) => i.id)} strategy={rectSortingStrategy}>
        {draggable.map((item) => (
          <SortableGridCard
            key={item.id}
            item={item}
            onAdd={() => onAdd(item.id)}
            onEdit={item.editable ? () => onEdit(item.id) : undefined}
            onView={item.editable ? undefined : () => onView(item.id)}
            onDelete={item.editable ? () => onDelete(item.id) : undefined}
          />
        ))}
      </SortableContext>
      {staticItems.map((item) => (
        <GridCardView key={item.id} item={item} />
      ))}
    </div>
  )
}

function NewNoteTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center aspect-square cursor-pointer"
      style={{
        gap: 8,
        background: 'transparent',
        border: '1.5px dashed var(--stone)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--sage)',
        transition: 'all var(--transition-gentle)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--forest)'; e.currentTarget.style.color = 'var(--forest)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--stone)'; e.currentTarget.style.color = 'var(--sage)' }}
    >
      <Plus size={22} strokeWidth={1.8} />
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500 }}>New note</span>
    </button>
  )
}

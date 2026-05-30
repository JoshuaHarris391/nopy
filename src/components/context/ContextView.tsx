import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  pointerWithin,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useShallow } from 'zustand/react/shallow'
import { MainHeader } from '../ui/MainHeader'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ContextBudgetBar } from './ContextBudgetBar'
import { ContextShelf, ShelfCardView } from './ContextShelf'
import { ContextGrid } from './ContextGrid'
import { GridCardView } from './ContextCard'
import { ContextNoteEditor } from './ContextNoteEditor'
import { useContextStore } from '../../stores/contextStore'
import { useModelCatalogStore } from '../../stores/modelCatalogStore'
import { useProfileStore } from '../../stores/profileStore'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore, selectLlmConfig } from '../../stores/settingsStore'
import { useLocalModels } from '../../hooks/useLocalModels'
import { resolveContextItems } from '../../services/contextResolver'
import { getModelContextWindow } from '../../services/models'
import { getTherapyPrompt } from '../../services/prompts/therapists'
import { estimateTokens } from '../../utils/tokenEstimator'
import type { ContextNote, ResolvedContextItem } from '../../types/context'

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--sage)', marginBottom: 10,
}

type Containers = { shelf: string[]; grid: string[] }

/**
 * Pointer-first collision detection: the drop target is whatever the cursor is
 * over, so dragging a card between the shelf and the grid follows the pointer
 * in both directions. Falls back to closestCorners for the keyboard sensor
 * (which has no pointer coordinates).
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args)
  return pointer.length > 0 ? pointer : closestCorners(args)
}

export function ContextView() {
  const notes = useContextStore((s) => s.notes)
  const injection = useContextStore((s) => s.injection)
  const loaded = useContextStore((s) => s.loaded)
  const loadContext = useContextStore((s) => s.loadContext)
  const addNote = useContextStore((s) => s.addNote)
  const updateNote = useContextStore((s) => s.updateNote)
  const deleteNote = useContextStore((s) => s.deleteNote)
  const setInjected = useContextStore((s) => s.setInjected)
  const applyShelf = useContextStore((s) => s.applyShelf)

  const profile = useProfileStore((s) => s.profile)
  const profileLoaded = useProfileStore((s) => s.loaded)
  const loadProfile = useProfileStore((s) => s.loadProfile)
  const entries = useJournalStore((s) => s.entries)
  const journalLoaded = useJournalStore((s) => s.loaded)
  const loadEntries = useJournalStore((s) => s.loadEntries)

  const llmConfig = useSettingsStore(useShallow(selectLlmConfig))
  const therapyType = useSettingsStore((s) => s.therapyType)
  const maxOutputTokens = useSettingsStore((s) => s.maxOutputTokens)
  const windowOverride = useSettingsStore((s) => s.modelContextWindowOverride)
  const localBaseUrl = useSettingsStore((s) => s.localBaseUrl)
  const { models: localModels } = useLocalModels(llmConfig.provider === 'local' ? localBaseUrl : '')
  const ensureCatalog = useModelCatalogStore((s) => s.ensure)
  const catalogWindows = useModelCatalogStore((s) => s.windows)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<ContextNote | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => { if (!loaded) loadContext() }, [loaded, loadContext])
  useEffect(() => { if (!profileLoaded) loadProfile() }, [profileLoaded, loadProfile])
  useEffect(() => { if (!journalLoaded) loadEntries() }, [journalLoaded, loadEntries])
  useEffect(() => { ensureCatalog() }, [ensureCatalog])

  const resolved = useMemo(
    () => resolveContextItems(notes, injection, profile, entries),
    [notes, injection, profile, entries],
  )
  const injectedItems = useMemo(() => resolved.filter((r) => r.injected), [resolved])
  const availableItems = useMemo(() => resolved.filter((r) => !r.injected), [resolved])

  const byId = useMemo(() => new Map(resolved.map((r) => [r.id, r])), [resolved])
  const derived = useMemo<Containers>(() => ({
    shelf: injectedItems.map((i) => i.id),
    grid: availableItems.filter((i) => i.available).map((i) => i.id),
  }), [injectedItems, availableItems])
  const staticItems = useMemo(() => availableItems.filter((i) => !i.available), [availableItems])

  // Live container state during a drag (so the shelf opens a gap); null when idle.
  const [override, setOverride] = useState<Containers | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeOrigin, setActiveOrigin] = useState<'shelf' | 'grid' | null>(null)
  const containers = override ?? derived

  // Real context window for the active hosted model, from the LiteLLM catalog
  // (undefined for local, which uses its own native ping).
  const catalogWindow = useMemo(() => {
    if (llmConfig.provider === 'local') return undefined
    const id = llmConfig.provider === 'openai' ? llmConfig.openaiModel : llmConfig.anthropicMainModel
    return catalogWindows[id] ?? catalogWindows[id.replace(/-\d{8}$/, '')]
  }, [llmConfig, catalogWindows])

  const window = useMemo(
    () => getModelContextWindow(llmConfig, localModels, windowOverride, catalogWindow),
    [llmConfig, localModels, windowOverride, catalogWindow],
  )
  const baseTokens = useMemo(() => estimateTokens(getTherapyPrompt(therapyType)), [therapyType])
  const injectedTokens = useMemo(() => injectedItems.reduce((sum, i) => sum + i.tokenEstimate, 0), [injectedItems])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findContainer = (id: string): keyof Containers | null =>
    id === 'shelf' || id === 'grid' ? (id as keyof Containers)
      : containers.shelf.includes(id) ? 'shelf'
        : containers.grid.includes(id) ? 'grid'
          : null

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    setActiveId(id)
    setActiveOrigin(findContainer(id))
    setOverride(derived)
  }

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    const a = String(active.id)
    const o = String(over.id)
    const ac = findContainer(a)
    const oc = findContainer(o)
    if (!ac || !oc || ac === oc) return
    setOverride((prev) => {
      const base = prev ?? derived
      const overItems = base[oc]
      const idx = overItems.indexOf(o)
      const insertAt = idx >= 0 ? idx : overItems.length
      return {
        ...base,
        [ac]: base[ac].filter((x) => x !== a),
        [oc]: [...overItems.slice(0, insertAt), a, ...overItems.slice(insertAt)],
      }
    })
  }

  const reset = () => { setOverride(null); setActiveId(null); setActiveOrigin(null) }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    const a = String(active.id)
    const ac = findContainer(a)
    if (!over || !ac) { reset(); return }
    const o = String(over.id)
    const oc = findContainer(o)
    const base = override ?? derived
    let nextShelf = base.shelf
    if (oc) {
      const overItems = base[oc]
      const ai = overItems.indexOf(a)
      const oi = overItems.indexOf(o)
      const next = ai !== -1 && oi !== -1 && ai !== oi ? { ...base, [oc]: arrayMove(overItems, ai, oi) } : base
      nextShelf = next.shelf
    }
    applyShelf(nextShelf)
    reset()
  }

  const openNew = () => { setEditingNote(null); setEditorOpen(true) }
  const openEdit = (note: ContextNote) => { setEditingNote(note); setEditorOpen(true) }

  const handleSave = (data: { title: string; content: string; tags: string[] }) => {
    if (editingNote) {
      updateNote(editingNote.id, data)
    } else {
      const now = new Date().toISOString()
      addNote({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...data })
    }
    setEditorOpen(false)
    setEditingNote(null)
  }

  const activeItem = activeId ? byId.get(activeId) : null

  return (
    <>
      <MainHeader title="Context">
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)' }}>
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
      </MainHeader>

      <div className="flex-1 overflow-y-auto" style={{ padding: '24px 44px 48px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <ContextBudgetBar
            baseTokens={baseTokens}
            injectedTokens={injectedTokens}
            window={window.tokens}
            windowSource={window.source}
            outputReserve={maxOutputTokens}
          />

          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={reset}
          >
            <div style={{ marginTop: 24 }}>
              <div style={sectionLabelStyle}>Shelf — injected, in order</div>
              <ContextShelf ids={containers.shelf} byId={byId} onRemove={(id) => setInjected(id, false)} />
            </div>

            <div style={{ marginTop: 28 }}>
              <div style={sectionLabelStyle}>Available</div>
              <ContextGrid
                draggable={containers.grid.map((id) => byId.get(id)).filter((x): x is ResolvedContextItem => !!x)}
                staticItems={staticItems}
                onNewNote={openNew}
                onAdd={(id) => setInjected(id, true)}
                onEdit={(id) => { const n = notes.find((x) => x.id === id); if (n) openEdit(n) }}
                onDelete={(id) => setDeleteId(id)}
              />
            </div>

            <DragOverlay>
              {activeItem && activeOrigin === 'shelf' ? (
                <div style={{ width: 168, cursor: 'grabbing' }}>
                  <ShelfCardView item={activeItem} order={containers.shelf.indexOf(activeItem.id) + 1} dragging />
                </div>
              ) : activeItem ? (
                <div style={{ width: 180, cursor: 'grabbing' }}>
                  <GridCardView item={activeItem} dragging />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {editorOpen && (
        <ContextNoteEditor
          key={editingNote?.id ?? 'new'}
          note={editingNote}
          onSave={handleSave}
          onClose={() => { setEditorOpen(false); setEditingNote(null) }}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete note?"
        body="This permanently removes the note and its file on disk. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteId) deleteNote(deleteId); setDeleteId(null) }}
        onCancel={() => setDeleteId(null)}
      />
    </>
  )
}

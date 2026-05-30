import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { MainHeader } from '../ui/MainHeader'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ContextBudgetBar } from './ContextBudgetBar'
import { ContextShelf } from './ContextShelf'
import { ContextCard } from './ContextCard'
import { ContextNoteEditor } from './ContextNoteEditor'
import { useContextStore } from '../../stores/contextStore'
import { useProfileStore } from '../../stores/profileStore'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore, selectLlmConfig } from '../../stores/settingsStore'
import { useLocalModels } from '../../hooks/useLocalModels'
import { resolveContextItems } from '../../services/contextResolver'
import { getModelContextWindow } from '../../services/models'
import { getTherapyPrompt } from '../../services/prompts/therapists'
import { estimateTokens } from '../../utils/tokenEstimator'
import type { ContextNote } from '../../types/context'

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--sage)', marginBottom: 10,
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
  const moveInjected = useContextStore((s) => s.moveInjected)

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

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<ContextNote | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => { if (!loaded) loadContext() }, [loaded, loadContext])
  useEffect(() => { if (!profileLoaded) loadProfile() }, [profileLoaded, loadProfile])
  useEffect(() => { if (!journalLoaded) loadEntries() }, [journalLoaded, loadEntries])

  const resolved = useMemo(
    () => resolveContextItems(notes, injection, profile, entries),
    [notes, injection, profile, entries],
  )
  const injectedItems = useMemo(() => resolved.filter((r) => r.injected), [resolved])
  const availableItems = useMemo(() => resolved.filter((r) => !r.injected), [resolved])

  const window = useMemo(
    () => getModelContextWindow(llmConfig, localModels, windowOverride),
    [llmConfig, localModels, windowOverride],
  )
  const baseTokens = useMemo(() => estimateTokens(getTherapyPrompt(therapyType)), [therapyType])
  const injectedTokens = useMemo(
    () => injectedItems.reduce((sum, i) => sum + i.tokenEstimate, 0),
    [injectedItems],
  )

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

          <div style={{ marginTop: 24 }}>
            <div style={sectionLabelStyle}>Shelf — injected, in order</div>
            <ContextShelf items={injectedItems} onMove={moveInjected} onRemove={(id) => setInjected(id, false)} />
          </div>

          <div style={{ marginTop: 28 }}>
            <div style={sectionLabelStyle}>Available</div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              <NewNoteTile onClick={openNew} />
              {availableItems.map((item) => (
                <ContextCard
                  key={item.id}
                  item={item}
                  onAdd={() => setInjected(item.id, true)}
                  onEdit={item.editable ? () => {
                    const n = notes.find((x) => x.id === item.id)
                    if (n) openEdit(n)
                  } : undefined}
                  onDelete={item.editable ? () => setDeleteId(item.id) : undefined}
                />
              ))}
            </div>
          </div>
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

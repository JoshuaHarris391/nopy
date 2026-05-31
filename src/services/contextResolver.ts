import { estimateTokens } from '../utils/tokenEstimator'
import { renderProfileBlock, renderIndexBlock, renderNoteBlock, DEFAULT_JOURNAL_INDEX_LIMIT } from './contextAssembler'
import {
  SYSTEM_PROFILE_ID,
  SYSTEM_INDEX_ID,
  type ContextNote,
  type ContextInjection,
  type ResolvedContextItem,
  type InjectedContextItem,
} from '../types/context'
import type { PsychologicalProfile } from '../types/profile'
import type { JournalEntry } from '../types/journal'

/**
 * Merge notes + the two system items with the injection map into view-ready
 * `ResolvedContextItem`s. Token estimates come from the same renderers the
 * assembler uses, so the budget bar matches the real prompt. Sorted injected
 * first (by order), then available (by title). `indexLimit` caps the journal
 * index (0 = all) so the card title and estimate match the real prompt.
 */
export function resolveContextItems(
  notes: ContextNote[],
  injection: Record<string, ContextInjection>,
  profile: PsychologicalProfile | null,
  entries: JournalEntry[],
  indexLimit: number = DEFAULT_JOURNAL_INDEX_LIMIT,
): ResolvedContextItem[] {
  const inj = (id: string): ContextInjection => injection[id] ?? { id, injected: false, order: Number.MAX_SAFE_INTEGER }

  const items: ResolvedContextItem[] = []

  // System item: psychological profile.
  const profileBlock = renderProfileBlock(profile)
  const profileInj = inj(SYSTEM_PROFILE_ID)
  items.push({
    id: SYSTEM_PROFILE_ID,
    kind: 'profile',
    title: 'Psychological Profile',
    content: '',
    tags: [],
    injected: profileInj.injected,
    order: profileInj.order,
    tokenEstimate: estimateTokens(profileBlock),
    available: profileBlock.length > 0,
    editable: false,
  })

  // System item: journal entry index.
  const indexBlock = renderIndexBlock(entries, indexLimit)
  const indexedCount = entries.filter((e) => e.indexed && e.summary).length
  const shownCount = indexLimit > 0 ? Math.min(indexedCount, indexLimit) : indexedCount
  const indexInj = inj(SYSTEM_INDEX_ID)
  items.push({
    id: SYSTEM_INDEX_ID,
    kind: 'index',
    title: indexedCount > 0 ? `Journal Index (${shownCount} entries)` : 'Journal Index',
    content: '',
    tags: [],
    injected: indexInj.injected,
    order: indexInj.order,
    tokenEstimate: estimateTokens(indexBlock),
    available: indexBlock.length > 0,
    editable: false,
  })

  // User notes.
  for (const note of notes) {
    const n = inj(note.id)
    const title = note.title || 'Untitled'
    items.push({
      id: note.id,
      kind: 'note',
      title,
      content: note.content,
      tags: note.tags,
      injected: n.injected,
      order: n.order,
      tokenEstimate: estimateTokens(renderNoteBlock(title, note.content)),
      available: true,
      editable: true,
    })
  }

  return items.sort((a, b) => {
    if (a.injected && b.injected) return a.order - b.order
    if (a.injected) return -1
    if (b.injected) return 1
    return a.title.localeCompare(b.title)
  })
}

/**
 * The injected, ordered items in the slim shape `assembleContext` consumes.
 * Drops items that are toggled on but have no data (e.g. profile injected
 * before one has been generated).
 */
export function toInjectedItems(resolved: ResolvedContextItem[]): InjectedContextItem[] {
  return resolved
    .filter((r) => r.injected && r.available)
    .sort((a, b) => a.order - b.order)
    .map((r) => ({ kind: r.kind, id: r.id, title: r.title, content: r.content }))
}

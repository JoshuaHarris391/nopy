/**
 * Context Workspace types. A "context item" is anything that can be injected
 * into the chat system prompt: a user-authored note, the psychological
 * profile, or the journal entry index. Notes are stored as markdown on disk;
 * the profile/index are rendered on demand from their own stores. Which items
 * are injected (and in what order) is captured by a `ContextInjection` record
 * keyed by item id.
 */

export type ContextItemKind = 'note' | 'profile' | 'index'

/** Stable ids for the two system-provided items. */
export const SYSTEM_PROFILE_ID = 'system:profile'
export const SYSTEM_INDEX_ID = 'system:index'

/** A user-authored context document. Mirrors JournalEntry's on-disk model. */
export interface ContextNote {
  id: string
  title: string
  content: string // raw markdown
  tags: string[] // user-facing organisation only; never sent to the model
  createdAt: string // ISO
  updatedAt: string // ISO
  sourceFilename?: string // file under <journalPath>/context/
}

/**
 * Injection settings for ANY context item — notes and the two system items.
 * Keyed by item id (a note id, or SYSTEM_PROFILE_ID / SYSTEM_INDEX_ID).
 * `order` ascends left-to-right along the shelf = earliest-to-latest in the
 * prompt.
 */
export interface ContextInjection {
  id: string
  injected: boolean
  order: number
}

/**
 * Computed view of a context item, produced by `resolveContextItems`. Carries
 * everything the Context view and the budget bar need. Not persisted.
 */
export interface ResolvedContextItem {
  id: string
  kind: ContextItemKind
  title: string
  content: string // note body; '' for system items (rendered from their stores at assembly time)
  tags: string[]
  injected: boolean
  order: number
  tokenEstimate: number // estimateTokens() of the rendered block
  available: boolean // false for a system item that has no underlying data yet
  editable: boolean // notes only
}

/**
 * The slim shape passed to `assembleContext` for injection. The assembler
 * renders each kind via the shared renderers (profile/index from their source
 * data, notes from `content`), so the prompt matches the budget bar exactly.
 */
export interface InjectedContextItem {
  kind: ContextItemKind
  id: string
  title: string
  content: string // note body; ignored for profile/index
}

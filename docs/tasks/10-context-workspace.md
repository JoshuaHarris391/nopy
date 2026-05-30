# 10 — Context Workspace & Injection Control

## Problem

Today, every chat session injects the **full psychological profile** and a **journal
entry index table** into the system prompt by default, with no way for the user to opt
out, trim, or reorder. The logic is hardcoded in `assembleContext()`
(`src/services/contextAssembler.ts:31-67`):

- `profile.fullProfile` is injected verbatim — a 2,000–4,000 word clinical document
  (`generateFullProfile` targets `TOKEN_LIMITS.fullProfile = 10000` output tokens, so the
  stored document can be ~8–10K tokens on its own).
- The most recent 30 indexed entries are appended as a markdown table
  (`JOURNAL_INDEX_LIMIT = 30`).

For users on **large hosted models** this is fine. For users running **small local models
in LM Studio / Ollama** (often 4K–8K context windows — see the `SMALL_CONTEXT_THRESHOLD =
8192` warning in `src/components/settings/sections/api/LocalBlock.tsx:88`), or users who
simply don't want to pay for huge prompts, the injected context alone can consume or
overflow the entire window before the conversation even starts. There is currently:

- **No visibility** into how many tokens the injected context costs.
- **No control** over what gets injected.
- **No ordering** of injected material (the model weights later content differently).

## Goals

- A new **Context** workspace (sidebar item) where the user manages everything that can be
  fed into the chat system prompt: free-form **notes/documents** they write, plus the
  **psychological profile** and **journal index** as automatically-present items.
- A clear visual distinction between items **tagged for injection** and items that are just
  stored for reference.
- Injected items are **highlighted and placed on a shelf** at the top; their **left-to-right
  order defines the injection order** in the prompt.
- An **indicator bar** showing the configured model's context window and how much the
  selected context will consume — so the user can choose anything from *no injection at
  all* to *as much as fits*.
- Backwards compatible: a user who never opens the Context view keeps today's behaviour
  (profile + index injected).

## Non-goals (v1)

- Semantic / embedding-based retrieval of notes (that's task `09-semantic-embedding-retrieval.md`).
- Per-note injection of *partial* content (whole-note granularity only).
- Importing arbitrary binary documents (PDF/DOCX). v1 is markdown/plain-text notes only;
  file import can be a later enhancement.
- Changing the per-session "Explore with nopy" focused-entry mechanism (`ChatEntryContext`),
  which stays separate and is always injected last.

---

## User-facing behaviour

### The Context view (`/context`)

The workspace is a **shelf above a grid** — layout in Tailwind, theming in the project's
CSS variables (see [Layout & Tailwind](#layout--tailwind)):

- **Budget bar** — pinned at the top, in/just below `MainHeader`. It measures whatever sits
  on the shelf (see [The injection budget bar](#the-injection-budget-bar)).
- **The Shelf — _Injecting_ zone** (top): a single horizontal row holding every item tagged
  for injection, **in order, left → right = injection order** (leftmost is injected first =
  earliest in the prompt). The shelf has a subtle "ledge" (`--stone` bottom border +
  `--shadow-warm`) on a warm-cream background. Its cards are **highlighted** (forest/amber
  accent + "Injecting" badge), compact, and show an **order number** plus token estimate. The
  row scrolls horizontally (`overflow-x-auto`) when it overflows. Empty state: a dashed
  placeholder — "Nothing injected — your companion starts with a blank slate. Add cards from
  below." Reorder along the shelf (drag, or ◀/▶ controls) to change injection order.
- **The Grid — _Available_ zone** (below): every item **not** currently injected, rendered as
  **square note tiles** in a responsive auto-filling grid (`grid` + `aspect-square`). The
  first tile is a dashed **"+ New note"** tile. Each note tile shows a kind icon, title, a
  line-clamped preview, token estimate + tags, and an "Add to context" affordance — adding a
  tile sends it to the right end of the shelf; removing a shelf card returns it to the grid.

**Item kinds** (`ContextItemKind`):

- `note` — a markdown document the user wrote. Fully editable, deletable. Optional tags
  (e.g. `childhood`, `relationships`, `breakthrough`) for the user's own organisation.
- `profile` — the psychological profile. A **system card**: always present once a profile
  exists, distinct icon (`Target`, matching the Profile nav), not editable here (edited via
  `/profile`). Can be toggled and reordered like any other item.
- `index` — the journal entry index. A **system card**: present once there are indexed
  entries, distinct icon (`List`), not editable here (managed via `/index`). Toggle +
  reorder only.

System cards (Profile, Index) appear as distinctly-marked tiles in the grid (or cards on the
shelf when injected). Those with no data yet (no profile generated, or no indexed entries)
render as a **dimmed tile** with a hint ("Generate your profile to use it as context") and
cannot be added to the shelf.

### Editing notes

- The **+ New note** tile (first cell of the grid) → a lightweight markdown editor (title +
  body + optional tags). Reuse the patterns in `EntryEditor.tsx` / `EditorToolbar.tsx`
  (textarea + `useAutosave` + `useAutoResizeTextarea`) rather than introducing a rich-text
  editor. `marked` (already a dependency) renders previews if desired.
- Clicking an existing note tile opens the same editor.

### The injection budget bar

A persistent bar pinned **above the shelf** (and optionally mirrored in the chat composer)
showing consumption against the model's context window `W`:

```
[ base ][ injected context ............ ]| headroom (conversation + output) | free
 0                                         ▲ threshold                        W
```

- **base** — fixed system/therapy prompt + date (~small, always present).
- **injected context** — sum of token estimates for everything **on the shelf**, drawn
  segment-by-segment in shelf order so the user sees which card pushes them over.
- **threshold** marker at `W − outputReserve − conversationReserve`. Crossing it warns
  (amber) that the live conversation will be squeezed; exceeding `W` errors (coral).
- Reads `W` from `getModelContextWindow()` (see below). Shows the source ("LM Studio:
  8,192" / "Claude Sonnet 4.5: 200,000" / "manual: 32,000").

This is the primary control surface: the user adds tiles to the shelf, removes them, and
reorders them while watching the bar, deciding how much to spend.

---

## Data model

New file `src/types/context.ts`:

```typescript
export type ContextItemKind = 'note' | 'profile' | 'index'

export const SYSTEM_PROFILE_ID = 'system:profile'
export const SYSTEM_INDEX_ID = 'system:index'

/** A user-authored context document. Mirrors JournalEntry's disk model. */
export interface ContextNote {
  id: string
  title: string
  content: string          // raw markdown
  tags: string[]           // user-facing organisation only; not sent to the model
  createdAt: string        // ISO
  updatedAt: string        // ISO
  sourceFilename?: string  // file under <journalPath>/context/
}

/**
 * Injection settings for ANY context item — notes and the two system items.
 * Keyed by item id (a note id, or SYSTEM_PROFILE_ID / SYSTEM_INDEX_ID).
 * `order` ascends left-to-right along the shelf = earliest-to-latest in the prompt.
 */
export interface ContextInjection {
  id: string
  injected: boolean
  order: number
}

/** Computed by a store selector for the view + the assembler. Not persisted. */
export interface ResolvedContextItem {
  id: string
  kind: ContextItemKind
  title: string
  injected: boolean
  order: number
  tokenEstimate: number    // estimateTokens() of the rendered block
  available: boolean       // false for system items with no underlying data
  editable: boolean        // true for notes only
}
```

### Store — `src/stores/contextStore.ts`

Model it on `journalStore`/`profileStore` (Zustand + `idb-keyval`, mirror to disk):

State: `notes: ContextNote[]`, `injection: Record<string, ContextInjection>`,
`loaded: boolean`, `lastError: string | null`.

Actions:

- `loadContext()` — hydrate notes + injection map from IDB, falling back to disk
  (`loadContextFromDisk`). On first run with no manifest, seed the **default injection**
  (see Migration).
- `addNote(note)`, `updateNote(id, updates)`, `deleteNote(id)` — same IDB + disk + error
  surfacing pattern as `journalStore.addEntry/updateEntry/deleteEntry`. Deleting a note also
  drops its injection entry.
- `setInjected(id, injected)` — toggle; when turning on, append to the end of the injected
  order; when off, leave a stable `order` so re-enabling restores position.
- `reorder(id, newIndex)` (or `move(id, 'up'|'down')`) — renumber `order` among injected
  items.
- `resolveItems(profile, entries): ResolvedContextItem[]` — selector that merges notes +
  system items with the injection map, computes per-item token estimates via the same
  render functions the assembler uses (single source of truth), and sorts: injected first
  (by `order`), then available.

### Persistence — `src/services/contextPersistence.ts`

- Notes: markdown files with frontmatter under `<journalPath>/context/*.md`. Reuse
  `entryToMarkdown`/`parseMarkdown`/`slugify` from `fs.ts` (extract a generic helper or
  add `saveContextNoteToDisk`/`loadContextNotesFromDisk` mirroring the entry equivalents).
  Frontmatter: `id`, `title`, `tags`, `createdAt`, `updatedAt`.
- Injection manifest: `<journalPath>/context/manifest.json` — `ContextInjection[]`. Keeping
  it on disk (not just IDB/localStorage) makes ordering portable across machines, consistent
  with nopy's "data folder is the source of truth" model (`chat.ndjson`, `profiles/`).
- Mirror IDB keys: `nopy-context-notes`, `nopy-context-injection`. Debounced disk writer in
  the same spirit as `scheduleChatSave`.

---

## Model context-window detection

New helper in `src/services/models.ts`:

```typescript
// Best-effort static windows for hosted models. MUST have a safe fallback —
// model ids drift and new ones ship constantly.
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic (representative; extend as needed)
  'claude-sonnet-4-5-20250514': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  'claude-opus-4-6': 200_000,
  // OpenAI (representative)
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
}

export const DEFAULT_CONTEXT_WINDOW = {
  anthropic: 200_000,
  openai: 128_000,
  local: 8_192,    // conservative; LM Studio usually reports the real value
} as const
```

```typescript
// src/services/models.ts (or a small contextWindow.ts)
export function getModelContextWindow(
  config: LlmConfig,
  localModels?: LocalModel[],        // from useLocalModels, local mode only
  override?: number | null,          // settings.modelContextWindowOverride
): { tokens: number; source: 'detected' | 'default' | 'manual' } {
  if (override && override > 0) return { tokens: override, source: 'manual' }
  if (config.provider === 'local') {
    const m = localModels?.find((x) => x.id === config.localModel)
    const t = m?.loadedContextLength ?? m?.maxContextLength
    return t ? { tokens: t, source: 'detected' }
             : { tokens: DEFAULT_CONTEXT_WINDOW.local, source: 'default' }
  }
  const id = config.provider === 'openai' ? config.openaiModel : config.anthropicMainModel
  const t = MODEL_CONTEXT_WINDOWS[id]
  return t ? { tokens: t, source: 'detected' }
           : { tokens: DEFAULT_CONTEXT_WINDOW[config.provider], source: 'default' }
}
```

- **Local** is the only provider that reports a true window today
  (`LocalModel.loadedContextLength` / `maxContextLength`, `src/hooks/useLocalModels.ts:6-16`).
- **Anthropic/OpenAI** windows come from the static map; the model-list endpoints only
  return `{ id, displayName }`.
- A **manual override** (`settings.modelContextWindowOverride`) always wins, so the user can
  correct a wrong/missing detection and the indicator stays honest.

---

## Token accounting

- Reuse `estimateTokens()` (`src/utils/tokenEstimator.ts`, `len/4`). It is rough but already
  the basis of the existing budget logic — consistency matters more than precision here.
- The **render functions must be shared** between the assembler (what actually gets sent) and
  the store selector (what the bar shows), so the estimate matches reality. Extract per-kind
  renderers, e.g.:
  - `renderProfileBlock(profile): string` (profile + themes, current lines 31-46)
  - `renderIndexBlock(entries): string` (index table, current lines 48-67)
  - `renderNoteBlock(note): string` → `\n\n## ${note.title}\n${note.content}`

---

## Context assembly changes

Refactor `assembleContext()` (`src/services/contextAssembler.ts`) so the hardcoded
profile/index blocks become **driven by the injected item list**:

New signature (additive — keep it a pure function, keep the test suite green where possible):

```typescript
export function assembleContext(
  session: ChatSession,
  injectedItems: ResolvedContextItem[],   // ordered; resolved by contextStore
  profile: PsychologicalProfile | null,   // still needed to render the profile block
  entries: JournalEntry[],                 // still needed to render the index block
  systemPrompt: string,
  window: number,                          // model context window W
  maxOutputTokens: number,                 // output reserve
  contextBudget: number,                   // existing message-history cap (upper bound)
  entryContext?: ChatEntryContext,
): AssembledContext
```

Assembly order:

1. Base system prompt + today's date (always).
2. **Injected context items, in `order`.** For each, render via the shared renderer for its
   kind. Stop adding further items once cumulative system tokens would exceed
   `W − maxOutputTokens − conversationReserve`; **log every skipped item** (no silent
   truncation — mirror the existing index-cap logging at lines 65-66). In practice the UI
   bar means the user rarely hits this, but the assembler must stay safe for tiny windows.
3. Focused entry context (`entryContext`), if present — unchanged, injected last for highest
   attention (current lines 69-74).
4. Session summary + message history — unchanged logic, but the **effective message budget
   becomes** `min(contextBudget, W − systemTokens − maxOutputTokens)` instead of the flat
   `contextBudget`. This ties total prompt size to the real window and is the fix that makes
   small-model chat reliable end-to-end.

`conversationReserve`: v1 = `clamp(0.2 * W, 2_000, 50_000)` (derived, not user-configurable;
flag as a future setting). Keeps headroom for the live exchange proportional to the window.

`ChatView.handleSend` (`src/components/chat/ChatView.tsx:219`) updates its call: resolve
injected items from `contextStore`, compute `W` via `getModelContextWindow`, and pass the new
args. Note `ChatView` will need the resolved context items + `W` available at send time
(read from the store imperatively like it already does for profile/entries at lines 214-218).

---

## Settings changes

- Add `modelContextWindowOverride: number | null` to `UserSettings`
  (`src/types/settings.ts`) + setter in `settingsStore.ts` + a persist `migrate` bump
  (v3 → v4, default `null`).
- The existing `contextBudget` field stays (now an **upper bound** on message history rather
  than the sole budget). Consider relabelling its Settings copy
  (`src/components/settings/sections/ApiSection.tsx:50`) to "Max conversation history".
- Optional: surface the manual window override near the provider block, or inline in the
  Context view next to the bar (preferred — keeps it where it's used).

---

## Navigation changes

- `src/components/sidebar/Sidebar.tsx` — add to `navItems` (line 8): `{ to: '/context', icon:
  Layers /* or FolderOpen */, label: 'Context', section: 'Understand' }`. Suggested position:
  right after Chat, since Context feeds Chat.
- `src/components/sidebar/BottomNav.tsx` — add the matching mobile item (note this nav shows
  5 items already; adding a 6th may need layout review, or Context lives only in the desktop
  sidebar + a Settings-adjacent entry on mobile — decide during build).
- `src/App.tsx` — add `<Route path="context" element={<ContextView />} />` (line ~54). If
  notes use a dedicated editor route, add `context/new` and `context/:id` too.

---

## Component inventory (new) — `src/components/context/`

- `ContextView.tsx` — page shell: `MainHeader` "Context" + budget bar + **shelf** + **grid**.
- `ContextBudgetBar.tsx` — the segmented indicator bar (extend `ProgressBar.tsx` styling),
  pinned above the shelf.
- `ContextShelf.tsx` — the horizontal, ordered _Injecting_ strip (`flex gap-3 overflow-x-auto`
  + ledge). Renders compact `ContextShelfCard`s: order number, kind icon, token estimate,
  ◀/▶ (or drag handle), and remove.
- `ContextCard.tsx` — a **square** note/system tile for the grid (`aspect-square`): kind icon,
  title, line-clamped preview, token estimate + tags, "Add to context", and edit/delete (for
  notes).
- `ContextNoteEditor.tsx` — title + markdown body + tags editor (reuse `EditorToolbar`,
  `useAutosave`, `useAutoResizeTextarea`).
- A dashed **"+ New note"** tile is the first grid cell (can live inside `ContextView`).

### Layout & Tailwind

Match the house convention: **layout via Tailwind utility classes, theming via inline
`style={{}}` + CSS variables** (that's how light/dark mode works through `[data-theme="dark"]`
in `src/index.css`). Reuse the existing patterns rather than inventing new ones:

- **Grid** — model on the metric-card grid in `ProfileView.tsx`:
  `<div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>`
  with each tile `aspect-square`. Tailwind v4 also accepts the arbitrary-value class
  `grid-cols-[repeat(auto-fill,minmax(180px,1fr))]` if you prefer it over the inline style.
- **Shelf** — `flex items-stretch gap-3 overflow-x-auto pb-3`; ledge via a `--stone` bottom
  border + `--shadow-warm`.
- **Card** — reuse the `EntryCard.tsx` / `MetricCard` treatment: `--parchment` bg, `--stone`
  border, `--radius-md`, `--shadow-warm` → `--shadow-warm-hover` and `translateY(-2px)` on
  hover, accent bar. Injected (shelf) cards add the forest/amber accent + "Injecting" badge.
- **Responsive** — the grid auto-fills/wraps; the shelf scrolls horizontally at every width.
  Follow the existing `md:`/`lg:` breakpoints and the 1024px sidebar auto-collapse.

---

## Files to create / modify

**Create**

- `src/types/context.ts` — types above.
- `src/stores/contextStore.ts` — notes + injection state, selectors.
- `src/services/contextPersistence.ts` — disk read/write for notes + manifest.
- `src/components/context/ContextView.tsx`
- `src/components/context/ContextBudgetBar.tsx`
- `src/components/context/ContextShelf.tsx` (+ `ContextShelfCard`)
- `src/components/context/ContextCard.tsx`
- `src/components/context/ContextNoteEditor.tsx`
- `src/__tests__/services/contextAssembler.test.ts` updates + new
  `src/__tests__/stores/contextStore.test.ts`.

**Modify**

- `src/services/contextAssembler.ts` — extract per-kind renderers; drive injection from the
  ordered item list; window-aware message budget.
- `src/services/models.ts` — `MODEL_CONTEXT_WINDOWS`, `DEFAULT_CONTEXT_WINDOW`,
  `getModelContextWindow`.
- `src/services/fs.ts` — generic note save/load helpers (or keep them in
  `contextPersistence.ts`).
- `src/components/chat/ChatView.tsx` — new `assembleContext` call + resolve injected items.
- `src/types/settings.ts`, `src/stores/settingsStore.ts` — `modelContextWindowOverride` +
  migrate v4.
- `src/components/settings/sections/ApiSection.tsx` — relabel context budget; optional
  window override control.
- `src/components/sidebar/Sidebar.tsx`, `src/components/sidebar/BottomNav.tsx`, `src/App.tsx`
  — nav + route.
- `docs/architecture/llm-pipeline.md` — update the "Chat context assembly" section (lines
  94-108) to describe injection-driven assembly.

## Dependencies

- **`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`** (React 19 compatible) —
  a single `DndContext` over both the shelf and the grid gives the unified iOS-style
  interaction: drag a grid tile onto the shelf to inject it (the shelf opens a **live gap**
  via `horizontalListSortingStrategy`), reorder within the shelf, and drag a card off the
  shelf to remove it. A `DragOverlay` renders the lifted clone (scale/shadow). Built-in
  `KeyboardSensor` + `sortableKeyboardCoordinates` give keyboard reordering for free. Chosen
  over `motion`'s `Reorder` because that is single-group and can't do cross-zone drag.
  Grid tiles keep an **"Add to context"** button as a click shortcut.

## Migration & backwards compatibility

- **Default injection seed** (first run, no manifest): `profile` injected at `order 0`,
  `index` injected at `order 1`, both **on** — this reproduces today's `assembleContext`
  behaviour exactly. New notes default to **not injected**.
- A user who never opens the Context view sees no change in chat output.
- Settings persist bump: `nopy-settings` v3 → v4 adds `modelContextWindowOverride: null`.
- No change to journal entries, profile, or chat on-disk formats. Notes live in a new
  `context/` subfolder; the manifest is additive.

## Testing notes

Follow the repo's testing guidelines (clear inputs/outputs, explanatory docstrings). The
areas this feature touches already carry a strong baseline — **extend it, don't start from
scratch**. Verified counts: `contextAssembler.test.ts` = 14, `settingsStore.test.ts` = 10
(incl. explicit v0→v3 / v1→v3 / v2→v3 migration tests), `tokenEstimator` = 5, `useLocalModels`
= 6, `localServer` = 24, `fs` = 22, `chatPersistence` = 12, `ApiSection` = 18.

- **contextAssembler — treat the existing 14 tests as the back-compat characterization
  suite.** The new signature (adds `injectedItems`, `window`, `maxOutputTokens`) touches
  **all 14 call sites**, so each updates mechanically. Tests #3/#6/#8 (full profile injected,
  indexed entries in the table, cap-at-30) must stay green — they prove the **default
  injection seed (profile + index on)** reproduces today's output. Lock in one approach during
  the build: either give `assembleContext` a back-compat default (inject profile + index when
  no injection list is passed) **or** update each test to pass the default-seeded items. Then
  add new cases: injected **order** is respected in the output; an un-injected profile/index is
  **absent**; a tiny `W` drops lowest-priority shelf items and **logs** them; the
  message-history budget shrinks with `W`; `entryContext` still lands last.
- **settings migration — extend the existing pattern.** `settingsStore.test.ts` already has
  v0/v1/v2→v3 migration tests; copy one for **v3→v4**, asserting `modelContextWindowOverride`
  defaults to `null` and all prior fields survive.
- **getModelContextWindow** (new): local detected vs. default; hosted map hit vs. fallback;
  manual override wins over everything.
- **contextStore** (new): toggle on appends to injected order; toggle off preserves `order`;
  reorder renumbers correctly; delete removes the note and its injection entry; default seed
  matches legacy behaviour.
- **Token math** (new): the store selector's per-item estimate equals the assembler's
  rendered-block estimate (shared-renderer guarantee).
- Manual: small local model (load an 8K model in LM Studio) — the bar turns amber/coral as you
  add shelf cards; with the shelf empty, chat sends a minimal prompt and succeeds.

## Open questions / decisions

1. **Reorder UX** — _resolved_: unified `@dnd-kit` drag across shelf + grid — drag a tile
   onto the shelf to inject (live gap), reorder within the shelf, drag off to remove, plus
   keyboard reorder. Grid "Add to context" remains as a click shortcut.
2. **`conversationReserve`**: derived `clamp(0.2*W, 2k, 50k)` for v1, or expose as a setting?
3. **Mobile nav**: 6th `BottomNav` item vs. desktop-only Context entry.
4. **Index granularity**: keep `JOURNAL_INDEX_LIMIT = 30`, or make the injected index's entry
   count user-configurable from the Context card? (Out of scope for v1; note for later.)
5. **File import** (PDF/DOCX/txt drop-in as notes): explicitly deferred — confirm v1 is
   markdown-only.

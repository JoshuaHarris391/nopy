# State Management

How Zustand stores are structured, what they own, and the boundary rules that keep them decoupled.

**Contents**

- [Store inventory](#store-inventory) — what each store owns
- [Boundary rules](#boundary-rules) — how stores and components interact
- [Persistence strategy](#persistence-strategy) — where each store saves its data
- [Error handling](#error-handling) — the `lastError` pattern
- [File reference](#file-reference)

---

## Store inventory

Nopy has five Zustand stores. Each owns a specific slice of application state. No store should read or write another store's internal fields directly — see [Boundary rules](#boundary-rules).

### `journalStore`

The central store for journal entries. Owns the `entries` array and all mutations on it.

| Field | Type | Description |
|---|---|---|
| `entries` | `JournalEntry[]` | All loaded entries, sorted by `createdAt` descending |
| `loaded` | `boolean` | Whether the initial IndexedDB load has completed |
| `syncing` | `boolean` | Whether a disk sync is in progress |
| `lastError` | `string \| null` | Human-readable error message from the last failed operation (see [Error handling](#error-handling)) |

Key actions:

- **`loadEntries()`** — reads the `nopy-entries` key from IndexedDB on app mount. No disk I/O.
- **`addEntry(entry)`** — prepends a new entry. Writes to memory → IndexedDB → disk.
- **`updateEntry(id, updates)`** — merges updates into an existing entry. Same write sequence.
- **`deleteEntry(id)`** — removes an entry from all three layers.
- **`syncFromDisk()`** — reconciles in-memory state against the journal directory. See `docs/architecture/data-pipeline.md` for the merge algorithm.
- **`processEntries(apiKey, force, onProgress, signal)`** — indexes unprocessed entries via Haiku. See `docs/architecture/llm-pipeline.md`.
- **`applyProcessedMetadata(results)`** — merges AI-generated metadata back into entries. The single entry point for this mutation — `profileStore` delegates to this rather than writing directly.
- **`clear()`** — empties entries and deletes the IndexedDB cache. Used by the "Delete All Data" flow.
- **`clearLastError()`** — dismisses the error banner.

### `profileStore`

Holds the user's psychological profile and runs the multi-step profile generation pipeline.

| Field | Type | Description |
|---|---|---|
| `profile` | `PsychologicalProfile \| null` | The current profile (narrative + local stats + full doc) |
| `loaded` | `boolean` | Whether the initial IndexedDB load has completed |
| `generating` | `boolean` | Whether profile generation is in progress |
| `phase` | `string` | Current phase label for the progress UI |
| `progress` | `{ current, total, title }` | Entry-level progress within the current phase |
| `lastError` | `string \| null` | Error message from the last failed operation |

Key actions:

- **`loadProfile()`** — reads from IndexedDB on app mount.
- **`setProfile(profile)`** — writes to IndexedDB and disk.
- **`generateProfile(entries, apiKey, signal)`** — runs the five-phase pipeline. See `docs/architecture/llm-pipeline.md`.
- **`clear()`** — empties the profile and deletes the IndexedDB cache.

### `chatStore`

Chat sessions and message history, stored one session per IndexedDB key.

| Field | Type | Description |
|---|---|---|
| `sessions` | `ChatSessionMeta[]` | Lightweight index of all sessions (id, title, createdAt) |
| `activeSession` | `ChatSession \| null` | The currently open session with full message history |

The `ChatSession` vs `ChatSessionMeta` split is intentional — it keeps the sidebar's session list small (metadata only) while lazy-loading message history when a session is opened.

### `settingsStore`

Simple settings (API key, preferred model, journal path, theme, sidebar collapse) persisted via Zustand's `persist` middleware to IndexedDB under the `nopy-settings` key.

This store is minimal and correct — don't overbuild it.

### `uiStore`

Ephemeral UI state (sidebar visibility, etc.). Not persisted.

---

## Boundary rules

These rules keep stores decoupled and mutations auditable:

1. **Stores only cross-talk via action methods.** If `profileStore` needs to update entries, it calls `useJournalStore.getState().applyProcessedMetadata(results)` — it does not call `useJournalStore.setState(...)` or write to IndexedDB directly.

2. **Components never call `setState` on a store.** Components call store actions. If the action doesn't exist, add it to the store.

3. **Components read via selectors, not full destructure.** Use `const entries = useJournalStore(s => s.entries)` to subscribe to only the fields you need. This prevents unnecessary re-renders.

4. **Store actions are the only write path.** If a mutation bypasses the store (e.g. a component calling `set('nopy-entries', ...)` directly), errors, logging, and side effects (like `lastError`) will not fire.

---

## Persistence strategy

| Store | Mechanism | Key(s) |
|---|---|---|
| `journalStore` | `idb-keyval` (manual `get`/`set` in actions) + Tauri `writeTextFile` | `nopy-entries` + `.md` files on disk |
| `profileStore` | `idb-keyval` (manual) + Tauri `writeTextFile` | `nopy-profile` + `profiles/profile.json` + `profiles/psychological-profile.md` on disk |
| `chatStore` | `idb-keyval` (manual) | `chat:meta` + `chat:session:{id}` per session |
| `settingsStore` | Zustand `persist` middleware | `nopy-settings` |
| `uiStore` | None (ephemeral) | — |

Every mutation writes the full value back. There is no partial update, batching, or lazy flush.

See `docs/architecture/data-pipeline.md` for the detailed three-layer write path and `docs/architecture/filesystem-layer.md` for the disk I/O specifics.

---

## Error handling

Disk and network operations can fail. The `lastError` pattern surfaces these failures to the UI:

1. Every store that performs I/O exposes a `lastError: string | null` field and a `clearLastError()` action.
2. When an action's underlying I/O throws, the action catches the error, sets `lastError` to a human-readable message, and re-throws so callers can react (e.g. `EntryEditor` avoids flashing "Saved").
3. The UI reads `lastError` from the store and renders an inline banner. The user dismisses it via `clearLastError()`.
4. The next successful operation automatically clears `lastError`.

See `docs/tasks/refactor/01-surface-fs-errors.md` for the implementation plan.

---

## File reference

| Concern | File |
|---|---|
| Journal entries store | `src/stores/journalStore.ts` |
| Profile store | `src/stores/profileStore.ts` |
| Chat sessions store | `src/stores/chatStore.ts` |
| Settings store | `src/stores/settingsStore.ts` |
| UI ephemeral store | `src/stores/uiStore.ts` |
| Store types | `src/types/journal.ts`, `src/types/profile.ts`, `src/types/chat.ts`, `src/types/settings.ts` |

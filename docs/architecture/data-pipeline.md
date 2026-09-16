# Data Pipeline

How a journal entry moves between disk, IndexedDB, and the UI — and where validation and AI processing fit in.

**Contents**

- [New dev walkthrough](#new-dev-walkthrough) — start here if you are new to the codebase
- [Markdown format](#markdown-format) — file layout, serialisation, and parsing rules
- [Disk I/O](#disk-io) — reading, validating, and writing `.md` files
- [IndexedDB layer](#indexeddb-layer) — the `idb-keyval` cache and its keys
- [Zustand stores](#zustand-stores) — in-memory state and write paths
- [Sync and reconciliation](#sync-and-reconciliation) — merging disk and cache
- [AI processing](#ai-processing) — entry indexing and profile generation
- [Chat persistence](#chat-persistence) — persisting chat history to disk
- [Operational notes](#operational-notes) — journal switching and known gaps
- [File reference](#file-reference) — where each concern lives in the code

---

## New dev walkthrough

If you are reading this file for the first time, start here. The rest of the doc is reference-level detail you can drill into once you have the mental model.

### The mental model

Nopy is a journaling app. Every entry is a plain markdown file that lives in a folder on the user's computer. That folder is "the journal." The user picks where it lives in settings.

There are three places where entry data exists at any given moment:

1. **On disk** — the `.md` files. This is the real, canonical data. If nopy disappeared tomorrow, the user still has their journal.
2. **In IndexedDB** — the browser's local database. This is a cache so the app doesn't have to re-read every file on launch.
3. **In memory** — Zustand stores that React components read from to render the UI.

```
┌─────────────┐   sync / load    ┌────────────┐   loadEntries   ┌──────────┐
│  .md files  │ ───────────────> │ IndexedDB  │ ──────────────> │ Zustand  │
│  (on disk)  │ <─────────────── │ idb-keyval │ <────────────── │  stores  │
└─────────────┘  save / write    └────────────┘   persist       └────┬─────┘
                                                                     │
                                                                     v
                                                                ┌─────────┐
                                                                │   UI    │
                                                                └─────────┘
```

The golden rule: **disk is the source of truth.** IndexedDB and memory are both just faster copies of it. There are no file watchers and no automatic sync timers — writes happen on save, reads happen on sync, and the user controls both.

### What a markdown file looks like

```
---
id: "5f8b-..."
title: "Morning pages"
createdAt: "2026-04-10T09:00:00.000Z"
updatedAt: "2026-04-10T09:15:00.000Z"
tags: ["focus","planning"]
indexed: true
mood: {"value":7,"label":"good"}
summary: "Short AI-generated summary"
---

The actual thing the user wrote goes here.
```

Each file has a frontmatter block between `---` fences followed by the body. The frontmatter is **real YAML**, serialized and parsed by the `yaml` library. See [Markdown format](#markdown-format) for the exact rules and `docs/architecture/filesystem-layer.md` for the full disk I/O reference.

### The lifecycle of an entry

**When the user opens the app** → `journalStore.loadEntries()` reads the `nopy-entries` key out of IndexedDB. That is it — no disk reads, no file walking. If the cache has 500 entries they all show up instantly. See [`loadEntries`](#loadentries).

**When the user clicks "Sync"** → `syncFromDisk()` walks the journal directory, reads every `.md` file, parses each one, and reconciles the results against whatever is in memory. Entries are matched by id, and whichever side has the newer `updatedAt` wins (disk wins on ties). See [Sync and reconciliation](#sync-and-reconciliation).

**When the user types in the editor** → the EntryEditor debounces every keystroke by 1500ms, then calls `updateEntry()`, which updates in-memory state, writes to IndexedDB, and writes the markdown file. Every mutation follows this memory → IndexedDB → disk sequence. See [Writing entries](#writing-entries).

**When the user clicks "Update Index"** → unindexed entries are sent to the lightweight model one at a time, oldest first. Each response is parsed by a tolerant Zod schema, then checked locally (closed vocabularies, verbatim quotes, roster leakage, confidence floor) and repaired through up to three retries before the structured record is written into the entry's frontmatter. See [AI entry processing](#ai-entry-processing).

**When the user clicks "Generate Profile"** → the entries in the chosen **scope** run through a [six-phase pipeline](#profile-generation): index any never-indexed ones, compute local stats, compute a corpus report from the records, generate a summary profile (lightweight model), generate or revise the full clinical document (main model) from records only, then keep the result as a new version and select it. Raw entry text is never sent to the profile steps.

### The validation layer

Three Zod schemas sit at trust boundaries. The point of all three is the same: never let unvalidated data reach IndexedDB or disk.

| Schema | Guards | Behaviour |
|---|---|---|
| [`FrontmatterEntrySchema`](#frontmatter-validation) | Data coming in from disk | Lenient on shape (fields optional), strict on types. Bad frontmatter loads the entry as unindexed with body preserved. |
| [`EntryRecordCoercedSchema`](#coercion-rules) | AI responses for entry indexing | Most forgiving of the three — every field falls back to null/empty so one bad field never fails the entry; closed vocabularies are enforced afterwards by local guards. |
| `ProfileResponseSchema` | AI response for the narrative profile | Strict. |

### Things that might trip you up

- **No file watchers.** If the user edits a file in another editor, nopy will not notice until the next manual sync. See [Operational notes](#no-file-watchers).
- **No atomic writes.** Memory, IndexedDB, and disk writes happen in sequence. If the disk write fails after the IndexedDB write succeeds, the two drift until the next sync. See [Write ordering](#write-ordering-and-atomicity).
- **Journal switching wipes the cache.** Picking a new journal folder clears IndexedDB entirely and hydrates fresh from the new directory. See [Journal switching](#journal-switching).
- **AI processing is sequential.** The indexing loop processes entries one at a time, not in parallel, for rate-limit safety.

---

The rest of this document is the reference-level detail: exact field tables, regex patterns, write paths, and line numbers. Use it when you need to touch one of these areas, not as a first read.

## Markdown format

Every entry file has frontmatter wrapped in `---` fences, followed by a blank line, then the body. See the example in [What a markdown file looks like](#what-a-markdown-file-looks-like).

Two rules define the format:

- **Values are standard YAML.** The serialiser uses `yaml.stringify()` and the parser uses `yaml.parse()` from the `yaml` library. Strings, arrays, objects, and multi-line values are all handled by the library.
- **The parser splits on `---` fences, then parses YAML.** See `parseMarkdown()` in `src/services/fs.ts`. The regex `/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/` splits the file into frontmatter and body, then `yaml.parse()` handles the frontmatter block. Malformed YAML falls back to treating the entry as plain markdown (body preserved, metadata discarded).

For the full disk I/O reference, see `docs/architecture/filesystem-layer.md`.

### What gets written

`entryToMarkdown()` always writes `id`, `title`, `createdAt`, `updatedAt`, `tags`, `indexed` and `indexVersion`. `mood` (with `moodSource`), `summary`, `indexModel` and the nested `insight` record are written only when present. For a v2-indexed entry `tags` holds the closed domains vocabulary; legacy entries keep their free-text tags until re-indexed.

## Disk I/O

Disk I/O is owned entirely by `src/services/fs.ts`: entry writes (`saveEntryToDisk`, `deleteEntryFromDisk`), entry reads (`loadEntriesFromDisk`), the selected profile (`saveProfileToDisk`) and the profile history (`saveProfileVersionToDisk`, `loadProfileHistoryFromDisk`, `deleteProfileVersionFromDisk`), plus `revealEntryOnDisk` for the entry view's folder button. Everything goes through Tauri's filesystem and opener plugins.

### Reading entries

`loadEntriesFromDisk()` (`fs.ts:159`) walks the journal directory and builds a `JournalEntry[]`:

1. `readDir(journalPath)` lists the directory.
2. For each `.md` file, `readTextFile` loads the contents.
3. [`parseMarkdown()`](#markdown-format) splits it into `{ frontmatter, content }`.
4. [`FrontmatterEntrySchema.safeParse(frontmatter)`](#frontmatter-validation) validates the frontmatter. On failure, a warning is logged and the entry is treated as if it had no frontmatter — its body is preserved, but metadata is discarded.
5. Fields are filled in with fallbacks: missing `id` gets a fresh UUID, missing timestamps fall back to a date parsed from the filename or `now()`, missing tags default to `[]`, missing `indexed` defaults to `false`, a missing `indexVersion` reads as `1` when the entry is indexed (legacy summary-only) and `0` otherwise. An `insight` block that fails validation is dropped to `null` with a console warning naming the file and the issues; the entry then counts as stale and Settings offers to re-index it.
6. The result is sorted by `createdAt` descending.

**Plain markdown imports are supported transparently.** The parser returns an empty frontmatter object, the empty object passes the (all-optional) schema, and `loadEntriesFromDisk` infers the title from the filename and uses the entire file as the body. Dropping a bare `.md` file into the journal directory and clicking Sync is a first-class import flow.

### Frontmatter validation

`FrontmatterEntrySchema` (`src/schemas/frontmatter.ts`) is the boundary between untrusted disk data and in-memory state:

| Field | Type | Default |
|---|---|---|
| `id` | `string` (optional) | — |
| `title` | `string` (optional) | — |
| `createdAt` | `string` (optional) | — |
| `updatedAt` | `string` (optional) | — |
| `mood` | `MoodScoreSchema \| null` (optional) | — |
| `moodSource` | `'writer' \| 'indexer' \| null` (optional) | `null` (treated as writer-rated) |
| `tags` | `string[]` (optional) | `[]` |
| `summary` | `string \| null` (optional) | — |
| `indexed` | `boolean` (optional) | `false` |
| `indexVersion` | `number` (optional) | derived on load, see above |
| `indexModel` | `string \| null` (optional) | — |
| `insight` | `EntryInsightSchema \| null` (optional) | `null` on validation failure (`.catch`) |
Every field is optional so that an empty frontmatter block (plain markdown imports) still parses successfully. UUID and ISO datetime formats are intentionally not enforced — legacy entries may have non-standard values, and `loadEntriesFromDisk` handles missing fields with its own fallbacks.

The schema is **strict about shape**, though: if `mood` is present it must be a valid `MoodScore`, and if `tags` is present it must be an array of strings. A corrupted file with `mood: "bad"` won't silently become an entry with garbage mood data — it will fail validation and load with its metadata discarded and its body intact.

### Writing entries

`saveEntryToDisk()` (`fs.ts:59`) is called from every [store mutation](#journalstore) that changes an entry.

- It uses `entry.sourceFilename` when present so edits overwrite the original file.
- For new entries it generates a filename from the slugified title, falling back to the entry id if the slug is empty.
- `mkdir(..., { recursive: true })` runs before each write to ensure the directory exists.

The EntryEditor debounces writes by **1500ms** after the last keystroke. On debounce fire, [`updateEntry()`](#journalstore) runs the full memory → IndexedDB → disk sequence. `Cmd/Ctrl+S` triggers an immediate save that bypasses the debounce.

## IndexedDB layer

Nopy uses [`idb-keyval`](https://github.com/jakearchibald/idb-keyval) as a thin key-value wrapper over IndexedDB. There is no schema, no migrations, no transactions beyond individual `get`/`set` calls.

| Key | Value | Owner |
|---|---|---|
| `nopy-entries` | `JournalEntry[]` | [`journalStore`](#journalstore) |
| `nopy-profile` | `PsychologicalProfile` (the selected version) | [`profileStore`](#profilestore) |
| `nopy-profile-history` | `ProfileVersionMeta[]` (newest first) | [`profileStore`](#profilestore) |
| `nopy-profile-version:<id>` | `PsychologicalProfile` (one kept generation) | [`profileStore`](#profilestore) |
| `nopy-settings` | `UserSettings` | [`settingsStore`](#settingsstore) (via Zustand `persist`) |
| `chat:meta` | `ChatSessionMeta[]` | [`chatStore`](#chatstore) |
| `chat:session:{id}` | `ChatSession` | [`chatStore`](#chatstore) |

Every mutation writes the full value back. There is no partial update, batching, or lazy flush. If a write throws, the calling store method propagates the error — there is no optimistic rollback.

## Zustand stores

### `journalStore`

The central store for entries. Its methods form a consistent write path: every mutation updates in-memory state, then IndexedDB, then disk, in that order.

| Method | Memory | IndexedDB | Disk |
|---|---|---|---|
| `loadEntries()` | set from cache | read | — |
| `addEntry(entry)` | prepend | write | write |
| `updateEntry(id, updates)` | merge, bump `updatedAt` | write | write |
| `deleteEntry(id)` | remove | write | delete |
| [`syncFromDisk()`](#sync-and-reconciliation) | reconcile | write | read (+ write-back) |
| [`processEntries(...)`](#ai-entry-processing) | set metadata, mark indexed | write | write each |

#### `loadEntries`

Called once on app mount. Reads `nopy-entries` from IndexedDB and pushes it into state. This is the path that makes the app feel instant — no file I/O involved.

#### Writing entries

`addEntry`, `updateEntry`, and `deleteEntry` all follow the same memory → IndexedDB → disk sequence. The disk call delegates to [`saveEntryToDisk`](#writing-entries) (or `deleteEntryFromDisk`).

#### Write ordering and atomicity

The three-layer write is **sequential, not atomic.** If the disk write fails after the IndexedDB write succeeds, the cache and disk drift until the next sync. This is intentional — disk failures are rare in Tauri land, and [reconciliation](#sync-and-reconciliation) handles drift correctly on the next sync.

### `profileStore`

Holds the **selected** `PsychologicalProfile` plus the list of every kept version (`versions`), and runs profile generation. `selectVersion(id)` and `deleteVersion(id)` manage the history; the selected version is the one Context and Chat read.

#### Profile generation

`generateProfile()` is a six-phase pipeline:

1. **Index unprocessed entries** — delegates to `processAllEntries` (lightweight model) for any entry in scope where `indexed === false`. See [AI entry processing](#ai-entry-processing).
2. **Local stats** — `computeLocalStats()` calculates average mood, journaling streak, average entry length, and reflection depth. No API call.
3. **Corpus report and summary profile** — `buildCorpusReport()` computes monthly rollups, the people roster, recurring phrases, predictions and safety flags from the records (no call); `generateProfileFromEntries()` then sends that report plus brief records to the lightweight model and returns structured themes, cognitive patterns, strengths, growth areas, and emotional trends. Validated with `ProfileResponseSchema`.
4. **Full profile** — `generateFullProfile()` sends the corpus report and rendered index records (never entry bodies) to the main model and returns a 2000–3500 word clinical markdown document; in incremental mode it sends the selected prior profile and only the records that profile has not seen. Not validated — the output is a free-form markdown string. The record tiers and budget fitting are described in [`llm-pipeline.md`](llm-pipeline.md#profile-generation).
5. **Persist** — merges everything into a new `PsychologicalProfile` version (with `id`, `createdAt`, the `scope` it was generated from, and `basedOn` when it revised the selected version), keeps it under `nopy-profile-version:<id>` and `profiles/history/<id>.json` (+ `.md`), adds it to `nopy-profile-history`, then selects it: `nopy-profile`, `profiles/profile.json` and `profiles/psychological-profile.md` always hold the selected version, which is what Context and Chat inject. Earlier versions are never overwritten; the Profile page can put any of them back in use or delete the ones not in use.

   Before step 1 the entry list is narrowed by the Profile page's **scope** setting (all entries, newest N, or last N months), so indexing, stats, the corpus report and both LLM passes see the same scoped list. A revision is only attempted when the selected version was generated under the same scope.

Each phase updates `phase` and `progress` in the store so the UI can show a progress bar. The whole pipeline respects an `AbortSignal` for cancellation.

### `settingsStore`

Simple state (API key, preferred model, journal path, theme, sidebar collapse states) persisted through Zustand's `persist` middleware to IndexedDB under `nopy-settings`.

### `chatStore`

Chat sessions are stored one per key (`chat:session:{id}`) with a separate `chat:meta` index listing all sessions. This splits large session histories into per-session records so the meta list stays small for the sidebar.

## Sync and reconciliation

`syncFromDisk()` (`journalStore.ts:69`) is the merge function between the in-memory cache and the on-disk state. It is called manually from the Sync button in `JournalView` and automatically after a [journal switch](#journal-switching).

Steps:

1. Load all entries from disk via [`loadEntriesFromDisk`](#reading-entries).
2. Index both sides by `id`, and disk entries also by `title.toLowerCase()`.
3. If two files carry the same frontmatter `id` (a copied file, or a rename whose old file survived), only the most recently updated one is loaded, no write-back is attempted for that id, and `lastError` names both files so the writer can delete one. Otherwise, for each disk entry matched by id to a memory entry, **disk wins when `disk.updatedAt >= memory.updatedAt`.** Disk entries with no memory match are added. Memory entries not found by id or title on disk are removed.
4. Sort the merged result by `createdAt` descending and write it to IndexedDB.
5. **Write-back pass:** any disk entry that originally lacked an `id` in its frontmatter (typically a plain-markdown import that was just assigned a fresh UUID by [`loadEntriesFromDisk`](#reading-entries)) is saved back to disk so it gains full frontmatter for next time.
6. Return `{ added, updated, removed }` counts for the UI to show.

Disk wins on timestamp ties. External edits to a `.md` file are picked up on the next sync, regardless of whether the memory copy was also modified.

## AI processing

### AI entry processing

When the user clicks "Update Index" (or Re-index on an entry, or "Re-index un-indexed entries" in Settings), the selected entries are sent to the lightweight model one at a time, oldest first:

```
processAllEntries(entries, config, mode, onProgress, signal)
  ├─ mode: 'unindexed' | 'stale' | 'needed' | 'all'
  └─ for each entry sequentially:
       hints = buildIndexHints(...)                 ← stated mood, people roster, recurring phrases
       processEntry(entry, config, signal, hints)
         ├─ provider call (lightweight slot, max 2500 output tokens)
         ├─ parseLLMJson(response, EntryRecordCoercedSchema)   ← tolerant Zod
         ├─ finaliseRecord(...)                                ← vocabularies, verbatim quotes, roster, confidence floor
         └─ findRecordProblems(...) → repair retry (max 3)
       journalStore.applyProcessedMetadata(results)
         ├─ writer-rated mood kept; indexer mood refreshed
         ├─ tags ← domains, summary, insight, indexVersion, indexModel
         ├─ IndexedDB write
         └─ disk write (frontmatter)
```

Entries are processed **sequentially, not in parallel**, so the roster and recurring phrases accumulate in the order the writer lived them and rate limits stay predictable. A thrown error on one entry is logged and the loop continues — one bad entry does not block the rest.

The full record shape, the hints, the guards and the repair loop are described in [`llm-pipeline.md`](llm-pipeline.md#entry-indexing).

#### Coercion rules

`EntryRecordCoercedSchema` (`src/schemas/journal.ts`) is deliberately forgiving with AI output. Where the model drifts, the schema falls back rather than rejecting the whole response, and the local guards decide what survives:

| Field | Drift | Repair |
|---|---|---|
| `mood.value` | Out of range (e.g. `99`) or non-numeric string | Coerce to number, clamp to 1–10, fall back to `5` |
| `mood.label` | Unknown label | Fall back to `"neutral"` |
| `domains`, `revelations`, `unclassified` | Bare string instead of array | Wrap in `[string]`; anything unparseable becomes `[]` |
| Any enum-valued field (emotions, interaction, coping, …) | Term outside the closed list | Routed by `applyVocabularies`: near-miss → canonical term, else `other` or dropped, and the raw term is kept in `unclassified` |
| `states.<key>` | Missing or malformed | `{ value: null, confidence: null, evidence: null }`; every one of the seven keys is always present |
| Any nested object (`focalEvent`, `prediction`, `body`, `safety`) | Missing or malformed | Null / empty defaults |
| `summary` | Missing or empty | Accepted by the schema, then flagged by `findRecordProblems` so the model is asked again |

Unparseable JSON throws an `LLMParseError`; the indexer feeds the zod issues (as `path: message` lines) back to the model in the repair prompt.

### AI profile generation

Covered in [`profileStore` → Profile generation](#profile-generation).

## Chat persistence

Chat sessions are persisted to `{journalPath}/chat.ndjson` so conversations survive IndexedDB clears and travel with the journal folder. The file is newline-delimited JSON: one session per line, no envelope. The persistence is **one-way: app → disk.** Disk is a backup and portability layer; IndexedDB remains the runtime source of truth.

### File structure

```
{"id":"uuid-1","title":"2026-04-13 — morning reflection","messages":[{"id":"...","role":"user","content":"...","timestamp":"..."}],"summary":null,"createdAt":"...","updatedAt":"...","status":"active","entryContextRef":"2026-04-03.md"}
{"id":"uuid-2","title":"Evening recap","messages":[...],"summary":null,"createdAt":"...","updatedAt":"...","status":"active","entryContextRef":null}
```

Each non-empty line is one `ChatSession` (after `stripForDisk` filtering). The loader parses line-by-line and skips malformed lines with a warning, so a single corrupt session cannot lose every other one. Writes still rewrite the whole file — this is one-session-per-line for **read tolerance**, not append-only. An empty session list writes a zero-byte file (preserving "user deleted everything" intent on next load).

`entryContext` (the full journal entry text) is **not** stored. Instead, `entryContextRef` holds just the filename of the linked entry. This keeps the file small and avoids stale duplicates — the entry content is already on disk as a `.md` file.

### Migration from legacy `chat.json`

Older versions wrote a single pretty-printed JSON object (`{ version, updatedAt, sessions: [...] }`) to `chat.json`. On first load after upgrade, `loadChatFromDisk` calls `migrateLegacyChatJson()`:

1. If only `chat.json` exists → parse it, write the equivalent `chat.ndjson`, delete `chat.json`.
2. If both files exist → leave both in place and log a warning. This is defensive: the legacy file could be a user-restored backup.
3. If only `chat.ndjson` (or neither) exists → no-op.

The migration is wrapped in a try/catch — if writing the new file fails, the legacy file is **not** deleted, and the next startup retries. There is no half-migrated state.

### Write path (cache → disk)

Every `chatStore` method that writes to IndexedDB also calls `_persistToDisk()`, which reads all full sessions from IDB and passes them to `scheduleChatSave()`. The save is **debounced by 2 seconds** — rapid sequential writes (e.g. `finalizeStreamingMessage` followed immediately by `updateSessionTitle`) collapse into a single disk write.

`updateStreamingMessage` (the high-frequency, in-memory-only streaming update) does **not** trigger a disk write.

The debounce module (`chatPersistence.ts`) exposes `flushChatSave()` to force an immediate write, used during journal switching.

### Startup fallback (IDB → disk)

`loadSessionList()` checks IndexedDB first. If the `chat:meta` key is empty or missing, it falls back to reading `chat.ndjson` from disk and populating IndexedDB from it. This handles:

- First launch after an IndexedDB clear
- Opening a journal folder on a new machine
- Switching to a journal that already has a `chat.ndjson`

### Lazy hydration of entry context

When a session is restored from `chat.ndjson`, it has `entryContextRef` (filename) but no `entryContext` (content). On the **first message send** in that session, `ChatView` detects this and calls `hydrateEntryContext()`:

1. Read the `.md` file from `{journalPath}/{entryContextRef}`
2. Parse frontmatter to extract title and date
3. Populate `session.entryContext` in both memory and IDB

After hydration, the entry content is injected into the LLM system prompt as the "Current Session Focus" — exactly as if the user had clicked "Explore with nopy." The file is read once; subsequent messages use the cached `entryContext`.

If the referenced file no longer exists (deleted or renamed), hydration silently returns null and the session continues without focused entry context.

### Journal switching

When the user switches journals, the flow is:

1. `flushChatSave()` — persist any pending writes to the **old** journal
2. `chatStore.clear()` — wipe all `chat:session:*` and `chat:meta` from IndexedDB
3. (journal and profile stores clear as before)
4. Set new journal path
5. `loadSessionList()` — loads `chat.ndjson` from the **new** journal (or starts empty)

### LLM context continuity

The LLM has no persistent memory. `contextAssembler.ts` sends the full message history (within token budget) on every API call. Restoring sessions from a `chat.ndjson` — even from a different journal — gives the LLM the same conversational context it had originally. No special handling needed.

## Operational notes

### Journal switching

Pointing nopy at a different directory (via `SettingsView`) is a hard reset:

1. `flushChatSave()` persists any pending chat writes to the old journal.
2. `chatStore.clear()`, `journalStore.clear()`, and `profileStore.clear()` wipe all caches.
3. `setJournalPath(newPath)` updates the persisted setting.
4. [`loadEntries()`](#loadentries) runs against the now-empty cache and returns `[]`.
5. [`syncFromDisk()`](#sync-and-reconciliation) hydrates entries from the new directory.
6. `loadSessionList()` loads `chat.ndjson` from the new directory (see [Chat persistence](#chat-persistence)).

There is no merge between old and new journals, and no confirmation beyond the UI prompt. The old journal's `.md` files and `chat.ndjson` on disk are untouched.

### No file watchers

Nopy does not watch the journal directory for external changes. If the user edits a file in another editor, nopy will not notice until the next manual sync. This is a deliberate choice — it keeps the app predictable and the user in control of when disk and cache reconcile.

### Known gaps

- **Writes are not atomic across the three layers** — see [Write ordering and atomicity](#write-ordering-and-atomicity).

## File reference

| Concern | File |
|---|---|
| Markdown serialisation and disk I/O | `src/services/fs.ts` |
| AI entry and profile processing | `src/services/entryProcessor.ts` |
| Record guards, corpus report, record rendering, scope | `src/services/entryRecords.ts` |
| Insights time series | `src/services/insightSeries.ts`, `src/utils/timeSeries.ts` |
| Frontmatter Zod schema | `src/schemas/frontmatter.ts` |
| AI response Zod schemas | `src/schemas/journal.ts`, `src/schemas/profile.ts` |
| Journal state and reconciliation | `src/stores/journalStore.ts` |
| Profile generation pipeline | `src/stores/profileStore.ts` |
| Settings persistence | `src/stores/settingsStore.ts` |
| Chat session storage | `src/stores/chatStore.ts` |
| Chat disk persistence and hydration | `src/services/chatPersistence.ts` |
| Core types | `src/types/journal.ts`, `src/types/profile.ts`, `src/types/chat.ts` |

## Related docs

- [State Management](state-management.md) — store boundary rules, persistence strategy, `lastError` pattern
- [Filesystem Layer](filesystem-layer.md) — Tauri gating, YAML frontmatter format, error contract
- [LLM Pipeline](llm-pipeline.md) — AI processing, context assembly, `parseLLMJson`, prompt templates
- [Components and Hooks](components.md) — UI primitives, custom hooks, component guidelines

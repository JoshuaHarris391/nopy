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

Each file has a frontmatter block between `---` fences followed by the body. The frontmatter is **not real YAML** — every value is JSON-encoded so the parser can use plain `JSON.parse` instead of pulling in a YAML library. See [Markdown format](#markdown-format) for the exact rules.

### The lifecycle of an entry

**When the user opens the app** → `journalStore.loadEntries()` reads the `nopy-entries` key out of IndexedDB. That is it — no disk reads, no file walking. If the cache has 500 entries they all show up instantly. See [`loadEntries`](#loadentries).

**When the user clicks "Sync"** → `syncFromDisk()` walks the journal directory, reads every `.md` file, parses each one, and reconciles the results against whatever is in memory. Entries are matched by id, and whichever side has the newer `updatedAt` wins (disk wins on ties). See [Sync and reconciliation](#sync-and-reconciliation).

**When the user types in the editor** → the EntryEditor debounces every keystroke by 1500ms, then calls `updateEntry()`, which updates in-memory state, writes to IndexedDB, and writes the markdown file. Every mutation follows this memory → IndexedDB → disk sequence. See [Writing entries](#writing-entries).

**When the user clicks "Update Index"** → unindexed entries get sent to Claude Haiku one at a time. The response flows through a Zod schema that repairs common drift (mood of 99 clamps to 5, bare string tags get wrapped in an array, unknown valence labels fall back to "Mixed"). See [AI entry processing](#ai-entry-processing).

**When the user clicks "Generate Profile"** → profile generation runs a [five-phase pipeline](#profile-generation): process unindexed entries, compute local stats, generate a narrative profile via Haiku, generate a full clinical document via Opus, then persist everything.

### The validation layer

Three Zod schemas sit at trust boundaries. The point of all three is the same: never let unvalidated data reach IndexedDB or disk.

| Schema | Guards | Behaviour |
|---|---|---|
| [`FrontmatterEntrySchema`](#frontmatter-validation) | Data coming in from disk | Lenient on shape (fields optional), strict on types. Bad frontmatter loads the entry as unindexed with body preserved. |
| [`EntryMetadataCoercedSchema`](#coercion-rules) | AI responses for entry metadata | Most forgiving of the three — actively repairs model drift. |
| `ProfileResponseSchema` | AI response for the narrative profile | Strict. |

### Things that might trip you up

- **No file watchers.** If the user edits a file in another editor, nopy will not notice until the next manual sync. See [Operational notes](#no-file-watchers).
- **No atomic writes.** Memory, IndexedDB, and disk writes happen in sequence. If the disk write fails after the IndexedDB write succeeds, the two drift until the next sync. See [Write ordering](#write-ordering-and-atomicity).
- **`emotionalValence` has a gap.** It lives in memory and IndexedDB but is not serialised to frontmatter. See [Known gap](#known-gap-emotionalvalence).
- **Journal switching wipes the cache.** Picking a new journal folder clears IndexedDB entirely and hydrates fresh from the new directory. See [Journal switching](#journal-switching).
- **AI processing is sequential.** The indexing loop processes entries one at a time, not in parallel, for rate-limit safety.

---

The rest of this document is the reference-level detail: exact field tables, regex patterns, write paths, and line numbers. Use it when you need to touch one of these areas, not as a first read.

## Markdown format

Every entry file has frontmatter wrapped in `---` fences, followed by a blank line, then the body. See the example in [What a markdown file looks like](#what-a-markdown-file-looks-like).

Two rules define the format:

- **Values are JSON-encoded.** Both the serialiser and the parser use `JSON.stringify` / `JSON.parse` on each frontmatter value. Strings are double-quoted, arrays and objects are JSON literals. This is deliberately stricter than real YAML so the parser stays simple.
- **The parser is custom, not a YAML library.** See `parseMarkdown()` in `src/services/fs.ts:40`. The regex `/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/` splits the file, then each frontmatter line is split on the first `: `. Anything that isn't valid JSON falls back to a raw string.

### What gets written

`entryToMarkdown()` (`fs.ts:17`) always writes `id`, `title`, `createdAt`, `updatedAt`, `tags`, and `indexed`. `mood` and `summary` are written only when present.

#### Known gap: `emotionalValence`

`emotionalValence` is **not** currently serialised to frontmatter, even though it exists on `JournalEntry` and is validated by [`FrontmatterEntrySchema`](#frontmatter-validation). It lives in memory and IndexedDB but is recomputed from the AI response each time the entry is re-indexed. If an entry is edited on disk and then synced back, its `emotionalValence` will be lost until the next index run.

## Disk I/O

Disk I/O is owned entirely by `src/services/fs.ts`. The module exposes three write functions (`saveEntryToDisk`, `deleteEntryFromDisk`, `saveProfileToDisk`) and one read function (`loadEntriesFromDisk`). Everything goes through Tauri's filesystem plugin.

### Reading entries

`loadEntriesFromDisk()` (`fs.ts:159`) walks the journal directory and builds a `JournalEntry[]`:

1. `readDir(journalPath)` lists the directory.
2. For each `.md` file, `readTextFile` loads the contents.
3. [`parseMarkdown()`](#markdown-format) splits it into `{ frontmatter, content }`.
4. [`FrontmatterEntrySchema.safeParse(frontmatter)`](#frontmatter-validation) validates the frontmatter. On failure, a warning is logged and the entry is treated as if it had no frontmatter — its body is preserved, but metadata is discarded.
5. Fields are filled in with fallbacks: missing `id` gets a fresh UUID, missing timestamps fall back to a date parsed from the filename or `now()`, missing tags default to `[]`, missing `indexed` defaults to `false`.
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
| `tags` | `string[]` (optional) | `[]` |
| `summary` | `string \| null` (optional) | — |
| `indexed` | `boolean` (optional) | `false` |
| `emotionalValence` | `EmotionalValenceSchema` (optional) | — |

Every field is optional so that an empty frontmatter block (plain markdown imports) still parses successfully. UUID and ISO datetime formats are intentionally not enforced — legacy entries may have non-standard values, and `loadEntriesFromDisk` handles missing fields with its own fallbacks.

The schema is **strict about shape**, though: if `mood` is present it must be a valid `MoodScore`, if `tags` is present it must be an array of strings, and `emotionalValence` must be one of the five allowed enum values. A corrupted file with `mood: "bad"` won't silently become an entry with garbage mood data — it will fail validation and load with its metadata discarded and its body intact.

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
| `nopy-profile` | `PsychologicalProfile` | [`profileStore`](#profilestore) |
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

Holds the `PsychologicalProfile` and runs profile generation.

#### Profile generation

`generateProfile()` (`profileStore.ts:44`) is a five-phase pipeline:

1. **Index unprocessed entries** — delegates to `processAllEntries` (Haiku) to fill in mood, tags, summary, and emotionalValence for any entry where `indexed === false`. See [AI entry processing](#ai-entry-processing).
2. **Local stats** — `computeLocalStats()` calculates average mood, journaling streak, average entry length, reflection depth, and emotional valence histogram. No API call.
3. **Narrative profile** — `generateProfileFromEntries()` sends entry summaries to Haiku and returns structured themes, cognitive patterns, strengths, growth areas, and emotional trends. Validated with `ProfileResponseSchema`.
4. **Full profile** — `generateFullProfile()` sends full entry bodies to Opus 4.6 and returns a 2000–4000 word clinical markdown document. Not validated — the output is a free-form markdown string.
5. **Persist** — merges everything into `PsychologicalProfile`, writes to `nopy-profile` in IndexedDB, and saves `profiles/profile.json` and `profiles/psychological-profile.md` next to the journal directory.

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
3. For each disk entry matched by id to a memory entry, **disk wins when `disk.updatedAt >= memory.updatedAt`.** Disk entries with no memory match are added. Memory entries not found by id or title on disk are removed.
4. Sort the merged result by `createdAt` descending and write it to IndexedDB.
5. **Write-back pass:** any disk entry that originally lacked an `id` in its frontmatter (typically a plain-markdown import that was just assigned a fresh UUID by [`loadEntriesFromDisk`](#reading-entries)) is saved back to disk so it gains full frontmatter for next time.
6. Return `{ added, updated, removed }` counts for the UI to show.

Disk wins on timestamp ties. External edits to a `.md` file are picked up on the next sync, regardless of whether the memory copy was also modified.

## AI processing

### AI entry processing

When the user clicks "Update Index", unprocessed entries are sent to Haiku one at a time:

```
processAllEntries(entries, apiKey, force=false)
  ├─ filter to !indexed (unless force=true)
  └─ for each entry sequentially:
       processEntry(entry, apiKey, signal)
         ├─ Anthropic API (Haiku, max 500 tokens)
         ├─ strip markdown code fences from the response
         ├─ JSON.parse(cleaned)
         └─ EntryMetadataCoercedSchema.parse(...)   ← coercive Zod
       journalStore.updateEntry(id, { ...metadata, indexed: true })
         ├─ IndexedDB write
         └─ disk write
```

Entries are processed **sequentially, not in parallel**, to keep token usage predictable and avoid rate limits. A thrown error on one entry is logged and the loop continues — one bad entry does not block the rest.

#### Coercion rules

`EntryMetadataCoercedSchema` (`src/schemas/journal.ts`) is deliberately forgiving with AI output. If the model drifts, the schema repairs common shapes rather than rejecting the whole response:

| Field | Drift | Repair |
|---|---|---|
| `mood.value` | Out of range (e.g. `99`) or non-numeric string | Coerce to number, clamp to 1–10, fall back to `5` |
| `mood.label` | Unknown label (e.g. `"excellent"`) | Fall back to `"neutral"` |
| `tags` | Bare string instead of array | Wrap in `[string]`, then enforce 1–10 items |
| `emotionalValence` | Unknown value (e.g. `"Amazing"`) | Fall back to `"Mixed"` |
| `summary` | Missing or empty | Throws — no safe fallback |

Structurally broken responses (missing required fields, unparseable JSON) throw a `ZodError` that propagates through the existing `console.error` + throw pattern in `entryProcessor.ts:44`.

### AI profile generation

Covered in [`profileStore` → Profile generation](#profile-generation).

## Operational notes

### Journal switching

Pointing nopy at a different directory (via `SettingsView`) is a hard reset:

1. `del('nopy-entries')` and `del('nopy-profile')` wipe the cache.
2. `setJournalPath(newPath)` updates the persisted setting.
3. [`loadEntries()`](#loadentries) runs against the now-empty cache and returns `[]`.
4. [`syncFromDisk()`](#sync-and-reconciliation) hydrates state from the new directory.

There is no merge between old and new journals, and no confirmation beyond the UI prompt. The old journal's `.md` files on disk are untouched.

### No file watchers

Nopy does not watch the journal directory for external changes. If the user edits a file in another editor, nopy will not notice until the next manual sync. This is a deliberate choice — it keeps the app predictable and the user in control of when disk and cache reconcile.

### Known gaps

- **`emotionalValence` is not serialised to frontmatter** — see [Known gap: `emotionalValence`](#known-gap-emotionalvalence).
- **Writes are not atomic across the three layers** — see [Write ordering and atomicity](#write-ordering-and-atomicity).

## File reference

| Concern | File |
|---|---|
| Markdown serialisation and disk I/O | `src/services/fs.ts` |
| AI entry and profile processing | `src/services/entryProcessor.ts` |
| Frontmatter Zod schema | `src/schemas/frontmatter.ts` |
| AI response Zod schemas | `src/schemas/journal.ts`, `src/schemas/profile.ts` |
| Journal state and reconciliation | `src/stores/journalStore.ts` |
| Profile generation pipeline | `src/stores/profileStore.ts` |
| Settings persistence | `src/stores/settingsStore.ts` |
| Chat session storage | `src/stores/chatStore.ts` |
| Core types | `src/types/journal.ts`, `src/types/profile.ts` |

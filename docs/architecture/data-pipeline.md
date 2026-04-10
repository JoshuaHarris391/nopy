# Data Pipeline

How a journal entry moves between disk, IndexedDB, and the UI — and where validation and AI processing fit in.

## New dev walkthrough

If you are reading this file for the first time, start here. The rest of the doc is the reference-level detail you can drill into once you have the mental model.

### The mental model

Nopy is a journaling app. Every journal entry is a plain markdown file that lives in a folder on the user's computer. That folder is "the journal." The user picks where it lives in settings.

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

The golden rule: disk is the source of truth. IndexedDB and memory are both just faster copies of it. There are no file watchers and no automatic sync timers — writes happen on save, reads happen on sync, and the user controls both.

### What a markdown file looks like

Each entry file has two parts: a frontmatter block between `---` fences with the metadata, and then the body as regular markdown.

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

One quirk worth knowing: the frontmatter is not real YAML. Every value is JSON-encoded, so strings are double-quoted and arrays and objects are written as JSON literals. This is deliberate because it lets the parser use plain `JSON.parse` on each value instead of pulling in a YAML library. See [Markdown format](#markdown-format) for the exact rules.

### The lifecycle of an entry

**When the user opens the app.** `journalStore.loadEntries()` reads the `nopy-entries` key out of IndexedDB. That is it — no disk reads, no file walking. If the cache has 500 entries they all show up instantly.

**When the user clicks "Sync".** This is where disk comes into play. `syncFromDisk()` walks the journal directory, reads every `.md` file, parses each one, and reconciles the results against whatever is in memory. Entries are matched by id, and whichever side has the newer `updatedAt` wins (disk wins on ties). Entries in memory but not on disk are considered deleted; files on disk but not in memory are added. See [Reconciliation](#reconciliation--syncfromdisk) for the full merge logic, including the write-back step that assigns ids to plain markdown imports.

**When the user types in the editor.** The EntryEditor debounces every keystroke by 1500ms. When the timer fires, `updateEntry()` updates in-memory state, writes the full entries array to IndexedDB, then calls `saveEntryToDisk` to write the markdown file. Cmd/S does the same thing without the debounce. Every mutation follows this same memory → IndexedDB → disk sequence. See [Writing to disk — autosave](#writing-to-disk--autosave).

**When the user clicks "Update Index".** Unindexed entries get sent to Claude Haiku one at a time. The model returns a JSON blob with mood, tags, a summary, and an emotional valence. The response flows through a Zod schema that tries to fix common drift — if the model returns a mood of 99 it clamps and falls back to 5; if it returns tags as a bare string it wraps in an array; if the emotional valence is unknown it falls back to "Mixed". Then the entry is marked indexed and the full write sequence runs. See [AI entry processing](#ai-entry-processing).

**When the user clicks "Generate Profile".** Profile generation runs a five-phase pipeline: process unindexed entries, compute local stats, generate a narrative profile via Haiku, generate a full clinical document via Opus, then persist everything. See [`profileStore`](#profilestore).

### The validation layer

There are three Zod schemas and they all sit at trust boundaries. The point of all three is the same: never let unvalidated data reach IndexedDB or disk, because once it is written it is hard to recover from.

- **`FrontmatterEntrySchema`** validates data coming in from disk. Corrupted frontmatter does not crash the app — the body is preserved and the entry loads as unindexed. See [Frontmatter validation](#frontmatter-validation).
- **`EntryMetadataCoercedSchema`** validates AI responses for per-entry metadata. This is the most forgiving of the three and actively repairs model drift. See [Coercion rules](#coercion-rules).
- **`ProfileResponseSchema`** validates the narrative profile response from Haiku. This one is strict.

### Things that might trip you up

**No file watchers.** If the user edits a file in another editor, nopy will not notice until the next manual sync. This is intentional — the app stays predictable and the user controls when disk and cache reconcile.

**No atomic writes.** The memory, IndexedDB, and disk writes happen in sequence. If the disk write fails after the IndexedDB write succeeds, the two drift. Reconciliation handles this correctly on the next sync, so it is fine in practice, but do not assume the three layers are always in lockstep.

**`emotionalValence` has a gap.** It lives on `JournalEntry` in memory and in the schema, but `entryToMarkdown` does not currently write it to frontmatter. If you edit an entry on disk and sync it back, its emotional valence is lost until you re-index. See the [Known gap](#what-gets-written) note.

**Journal switching wipes the cache.** When the user picks a new journal folder, IndexedDB is cleared entirely and hydrated fresh from the new directory. There is no merge. See [Journal switching](#journal-switching).

**AI processing is sequential.** The indexing loop processes entries one at a time, not in parallel, for rate-limit safety and cost predictability.

### Where to look in the code

| Flow | File |
|---|---|
| Writing and reading markdown files | `src/services/fs.ts` |
| Merge logic between disk and cache | `syncFromDisk` in `src/stores/journalStore.ts` |
| AI entry processing | `src/services/entryProcessor.ts` |
| Profile pipeline | `src/stores/profileStore.ts` |
| Validation schemas | `src/schemas/` |
| Core types | `src/types/journal.ts`, `src/types/profile.ts` |

---

The rest of this document is the reference-level detail: exact field tables, regex patterns, write paths, and line numbers. Use it when you need to touch one of these areas, not as a first read.

## Markdown format

Every entry file has frontmatter wrapped in `---` fences, followed by a blank line, then the body:

```
---
id: "5f8b..."
title: "Morning pages"
createdAt: "2026-04-10T09:00:00.000Z"
updatedAt: "2026-04-10T09:15:00.000Z"
tags: ["focus","planning"]
indexed: true
mood: {"value":7,"label":"good"}
summary: "Reflected on the sprint and set three priorities for the week."
---

Body content as raw markdown.
```

Two things to note about this format:

- **Values are JSON-encoded.** Both serialiser and parser use `JSON.stringify` / `JSON.parse` on each frontmatter value. Strings are double-quoted, arrays and objects are JSON literals. This is deliberately stricter than real YAML so the parser stays simple.
- **The parser is custom, not a YAML library.** See `parseMarkdown()` in `src/services/fs.ts:40`. The regex `/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/` splits the file, then each frontmatter line is split on the first `: `. Anything that isn't valid JSON falls back to a raw string.

### What gets written

`entryToMarkdown()` (`fs.ts:17`) always writes `id`, `title`, `createdAt`, `updatedAt`, `tags`, and `indexed`. `mood` and `summary` are written only when present.

**Known gap:** `emotionalValence` is not currently serialised to frontmatter even though it exists on `JournalEntry` and is validated by the frontmatter schema. It lives in memory and IndexedDB but is recomputed from the AI response each time the entry is re-indexed. If an entry is edited on disk and then synced back, its `emotionalValence` will be lost until the next index run.

## Reading from disk

`loadEntriesFromDisk()` (`fs.ts:159`) walks the journal directory and builds a `JournalEntry[]`:

1. `readDir(journalPath)` lists the directory.
2. For each `.md` file, `readTextFile` loads the contents.
3. `parseMarkdown()` splits it into `{ frontmatter, content }`.
4. `FrontmatterEntrySchema.safeParse(frontmatter)` validates the frontmatter. On failure, a warning is logged and the entry is treated as if it had no frontmatter — its body is preserved, but metadata is discarded.
5. Fields are filled in with fallbacks: missing `id` gets a fresh UUID, missing timestamps fall back to a date parsed from the filename or `now()`, missing tags default to `[]`, missing `indexed` defaults to `false`.
6. The result is sorted by `createdAt` descending.

Plain markdown files with no frontmatter are handled transparently. The parser returns an empty frontmatter object, the empty object passes the (all-optional) schema, and `loadEntriesFromDisk` infers the title from the filename and uses the entire file as the body. Dropping a bare `.md` file into the journal directory and syncing is a supported import flow.

## Frontmatter validation

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

The schema is strict about shape, though: if `mood` is present it must be a valid `MoodScore`, if `tags` is present it must be an array of strings, and `emotionalValence` must be one of the five allowed enum values. A corrupted file with `mood: "bad"` won't silently become an entry with a garbage mood — it will fail validation and load with its metadata discarded and its body intact.

## IndexedDB layer

Nopy uses [`idb-keyval`](https://github.com/jakearchibald/idb-keyval) as a thin key-value wrapper over IndexedDB. There is no schema, no migrations, no transactions beyond individual `get`/`set` calls.

| Key | Value | Owner |
|---|---|---|
| `nopy-entries` | `JournalEntry[]` | `journalStore` |
| `nopy-profile` | `PsychologicalProfile` | `profileStore` |
| `nopy-settings` | `UserSettings` | `settingsStore` (via Zustand `persist`) |
| `chat:meta` | `ChatSessionMeta[]` | `chatStore` |
| `chat:session:{id}` | `ChatSession` | `chatStore` |

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
| `syncFromDisk()` | reconcile | write | read (+ write-back) |
| `processEntries(...)` | set metadata, mark indexed | write | write each |

The three-layer write is sequential, not atomic. If the disk write fails after the IndexedDB write succeeds, the cache and disk drift until the next sync. This is intentional — disk failures are rare in Tauri land, and reconciliation handles drift correctly.

#### Reconciliation — `syncFromDisk()`

`syncFromDisk()` (`journalStore.ts:69`) is the merge function between the in-memory cache and the on-disk state:

1. Load all entries from disk.
2. Index both sides by `id`, and disk entries also by `title.toLowerCase()`.
3. For each disk entry matched by id to a memory entry, disk wins when `disk.updatedAt >= memory.updatedAt`. Disk entries with no memory match are added. Memory entries not found by id or title on disk are removed.
4. Sort the merged result by `createdAt` descending and write it to IndexedDB.
5. Write-back pass: any disk entry that originally lacked an `id` in its frontmatter (typically a plain-markdown import that was just assigned a fresh UUID in step 5 of the read pipeline) is saved back to disk so it gains full frontmatter for next time.
6. Return `{ added, updated, removed }` counts for the UI to show.

Disk wins on timestamp ties. External edits to a `.md` file are picked up on the next sync, regardless of whether the memory copy was also modified.

### `profileStore`

Holds the `PsychologicalProfile` and runs profile generation. `generateProfile()` (`profileStore.ts:44`) is a five-phase pipeline:

1. **Index unprocessed entries** — delegates to `processAllEntries` (Haiku) to fill in mood, tags, summary, and emotionalValence for any entry where `indexed === false`.
2. **Local stats** — `computeLocalStats()` calculates average mood, journaling streak, average entry length, reflection depth, and emotional valence histogram. No API call.
3. **Narrative profile** — `generateProfileFromEntries()` sends entry summaries to Haiku and returns structured themes, cognitive patterns, strengths, growth areas, and emotional trends. Validated with `ProfileResponseSchema`.
4. **Full profile** — `generateFullProfile()` sends full entry bodies to Opus 4.6 and returns a 2000–4000 word clinical markdown document. Not validated — the output is a free-form markdown string.
5. **Persist** — merges everything into `PsychologicalProfile`, writes to `nopy-profile` in IndexedDB, and saves `profiles/profile.json` and `profiles/psychological-profile.md` next to the journal directory.

Each phase updates `phase` and `progress` in the store so the UI can show a progress bar. The whole pipeline respects an `AbortSignal` for cancellation.

### `settingsStore`

Simple state (API key, preferred model, journal path, theme, sidebar collapse states) persisted through Zustand's `persist` middleware to IndexedDB under `nopy-settings`.

### `chatStore`

Chat sessions are stored one per key (`chat:session:{id}`) with a separate `chat:meta` index listing all sessions. This splits large session histories into per-session records so the meta list stays small for the sidebar.

## Writing to disk — autosave

The EntryEditor debounces writes by **1500ms** after the last keystroke. On debounce fire, `updateEntry()` runs the full memory → IndexedDB → disk sequence. `Cmd/Ctrl+S` triggers an immediate save that bypasses the debounce.

`saveEntryToDisk()` (`fs.ts:59`) uses `entry.sourceFilename` when present so edits overwrite the original file. For new entries it generates a filename from the slugified title plus a fallback to the entry id if the slug is empty. `mkdir(..., { recursive: true })` is called before each write.

## AI entry processing

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

Entries are processed sequentially, not in parallel, to keep token usage predictable and avoid rate limits. A thrown error on one entry is logged and the loop continues — one bad entry does not block the rest.

### Coercion rules

`EntryMetadataCoercedSchema` (`schemas/journal.ts`) is deliberately forgiving with AI output. If the model drifts, the schema repairs common shapes rather than rejecting the whole response:

| Field | Drift | Repair |
|---|---|---|
| `mood.value` | Out of range (e.g. `99`) or non-numeric string | Coerce to number, clamp to 1–10, fall back to `5` |
| `mood.label` | Unknown label (e.g. `"excellent"`) | Fall back to `"neutral"` |
| `tags` | Bare string instead of array | Wrap in `[string]`, then enforce 1–10 items |
| `emotionalValence` | Unknown value (e.g. `"Amazing"`) | Fall back to `"Mixed"` |
| `summary` | Missing or empty | Throws — no safe fallback |

Structurally broken responses (missing required fields, unparseable JSON) throw a `ZodError` that propagates through the existing `console.error` + throw pattern in `entryProcessor.ts:44`.

## Journal switching

Pointing nopy at a different directory (via `SettingsView`) is a hard reset:

1. `del('nopy-entries')` and `del('nopy-profile')` wipe the cache.
2. `setJournalPath(newPath)` updates the persisted setting.
3. `loadEntries()` runs against the now-empty cache and returns `[]`.
4. `syncFromDisk()` hydrates state from the new directory.

There is no merge between old and new journals, and no confirmation beyond the UI prompt. The old journal's `.md` files on disk are untouched.

## Key files

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

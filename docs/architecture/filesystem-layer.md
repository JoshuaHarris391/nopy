# Filesystem Layer

How nopy reads and writes journal files on disk via Tauri's filesystem plugin.

**Contents**

- [Tauri gating](#tauri-gating) — the dynamic import pattern
- [Frontmatter format](#frontmatter-format) — what's in the YAML header
- [Read path](#read-path) — loading entries from disk
- [Write path](#write-path) — saving entries to disk
- [Error contract](#error-contract) — what throws, what doesn't
- [File reference](#file-reference)

---

## Tauri gating

Nopy runs as a Tauri desktop app but also supports a web-only mode (no filesystem access). The entire disk I/O layer is gated behind two mechanisms:

### `hasFileSystem()`

A runtime check exported from `src/services/fs.ts`. Returns `true` when the Tauri environment is detected. Every public function in `fs.ts` early-returns (no-op) when `hasFileSystem()` is `false` or the journal path is empty.

### Dynamic imports

Tauri's filesystem plugin is imported dynamically inside each function:

```typescript
const { writeTextFile, readDir, ... } = await import('@tauri-apps/plugin-fs')
```

This keeps `@tauri-apps/plugin-fs` out of the web bundle entirely. **Preserve this pattern in any refactor** — a top-level import would break the web build.

---

## Frontmatter format

Every journal entry file has a YAML frontmatter block between `---` fences, followed by a blank line, then the body:

```yaml
---
id: 3f2a9c1e-...
title: Sunday, again
createdAt: 2025-03-14T20:00:00.000Z
updatedAt: 2025-03-14T20:05:12.000Z
tags:
  - relationship
  - housing
indexed: true
indexVersion: 2
mood:
  value: 4
  label: low
moodSource: writer
summary: Argued with Maya about the move after she found the unopened contract; went quiet rather than answer.
indexModel: <lightweight model id>
insight:
  inferredMood: 4
  states:
    anxiety: { value: 7, confidence: 0.8, evidence: tight chest, could not answer her }
    # … irritability, sadness, calm, agency, connection, meaning
  emotions: [{ label: anxious, intensity: 8 }]
  people: [{ name: Maya, role: partner, interaction: conflict, feltAfter: depleted, note: pushed for a decision }]
  quotes: [{ text: I dont think I have ever chosen something without checking someones face first, category: self_judgement, matchesRecent: null }]
  focalEvent: { trigger: Maya found the unopened contract, interpretation: I have let her down again, emotionBody: anxiety, behaviour: went silent, outcome: null, alternativeView: null }
  revelations: [I need to answer her before Friday, even if the answer is no]
  prediction: null
  coping: [{ strategy: avoidance, effect: -1, evidence: went quiet }]
  body: { sleepHours: 4, sleepQuality: null, movement: null, substances: [{ type: alcohol, quantity: 2 glasses }], symptoms: [chest_tightness], notes: null }
  safety: { flag: none, evidence: null }
  observations: [{ text: may withdraw into silence when pressed for a decision, kind: coping, basis: inferred }]
  unclassified: []
---

The actual thing the user wrote goes here.
```

The frontmatter is **real YAML**, serialized and parsed by the `yaml` library. This means:

- Multi-line strings, unquoted scalars, and standard YAML features are supported.
- Users can safely edit `.md` files in external editors (vim, VS Code, Obsidian) without corrupting metadata.
- The parser is `yaml.parse()`, not a hand-rolled line splitter.

After parsing, the raw object is validated by `FrontmatterEntrySchema` (`src/schemas/frontmatter.ts`). See `docs/architecture/data-pipeline.md` for the validation rules.

### What gets written

`entryToMarkdown()` always writes: `id`, `title`, `createdAt`, `updatedAt`, `tags`, `indexed`, `indexVersion`. `mood` (with `moodSource`), `summary`, `indexModel` and the nested `insight` record are written only when present. The index therefore travels with the journal: copy the folder and the index comes with it, and a hand-edited frontmatter changes what the app sees on the next sync.

---

## Read path

`loadEntriesFromDisk(journalPath)` walks the journal directory and builds a `JournalEntry[]`:

1. `readDir(journalPath)` lists the directory.
2. For each `.md` file, `readTextFile` loads the contents.
3. `parseMarkdown()` splits the file into `{ frontmatter, content }` using the regex `/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/` and `yaml.parse()`.
4. `FrontmatterEntrySchema.safeParse(frontmatter)` validates. On failure, a warning is logged and the entry is treated as plain markdown (body preserved, metadata discarded).
5. Missing fields get fallbacks: `id` → fresh UUID, timestamps → date from filename or `now()`, `tags` → `[]`, `indexed` → `false`, `indexVersion` → `1` if indexed else `0`. An `insight` block that fails validation is dropped to `null` with a warning naming the file and the failing fields; the entry then shows as needing re-indexing.
6. Result sorted by `createdAt` descending.

**Plain markdown imports work transparently.** A `.md` file with no frontmatter passes the all-optional schema and gets assigned defaults.

---

## Write path

`saveEntryToDisk(entry, journalPath)` writes a single entry:

1. Early-returns if `!hasFileSystem() || !journalPath`.
2. Ensures the directory exists via `mkdir(..., { recursive: true })`.
3. Uses `entry.sourceFilename` for the filename (preserves original filename on edit), or generates one from `slugify(entry.title, entry.id)`.
4. Calls `writeTextFile(filePath, entryToMarkdown(entry))`.

`deleteEntryFromDisk(id, journalPath, sourceFilename?)` deletes by filename if available, or scans the directory for a file containing the entry's ID.

`saveProfileToDisk(profile, journalPath)` writes the **selected** profile version to `profiles/profile.json` and `profiles/psychological-profile.md` next to the journal directory. Every generated version is also kept under `profiles/history/<id>.json` (+ `<id>.md` for the full text) by `saveProfileVersionToDisk`; `loadProfileHistoryFromDisk` lists them (skipping unparseable files) and `deleteProfileVersionFromDisk` removes one. A lone `profile.json` from before versioning is copied into `history/` on first load.

---

## Error contract

Filesystem functions **throw on failure**. The early-return cases (`!hasFileSystem()`, empty path) are no-ops, not errors.

Callers (Zustand store actions) catch the thrown error, populate `lastError` on the store, and re-throw so components can react. See `docs/architecture/state-management.md` for the `lastError` pattern.

This is important: a successful `saveEntryToDisk` call means the file is on disk. A thrown error means it is not. The caller must never assume success without awaiting the promise.

---

## File reference

| Concern | File |
|---|---|
| All disk I/O functions | `src/services/fs.ts` |
| Frontmatter validation schema | `src/schemas/frontmatter.ts` |
| Frontmatter test suite | `src/__tests__/schemas/frontmatter.test.ts` |
| Fs function test suite | `src/__tests__/services/fs.test.ts` |
| Entry type | `src/types/journal.ts` |

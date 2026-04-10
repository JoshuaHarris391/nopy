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
id: "5f8b-..."
title: "Morning pages"
createdAt: "2026-04-10T09:00:00.000Z"
updatedAt: "2026-04-10T09:15:00.000Z"
tags: ["focus", "planning"]
indexed: true
mood:
  value: 7
  label: "good"
summary: "Short AI-generated summary"
---

The actual thing the user wrote goes here.
```

The frontmatter is **real YAML**, serialized and parsed by the `yaml` library. This means:

- Multi-line strings, unquoted scalars, and standard YAML features are supported.
- Users can safely edit `.md` files in external editors (vim, VS Code, Obsidian) without corrupting metadata.
- The parser is `yaml.parse()`, not a hand-rolled line splitter.

After parsing, the raw object is validated by `FrontmatterEntrySchema` (`src/schemas/frontmatter.ts`). See `docs/architecture/data-pipeline.md` for the validation rules.

### What gets written

`entryToMarkdown()` always writes: `id`, `title`, `createdAt`, `updatedAt`, `tags`, `indexed`. `mood` and `summary` are written only when present.

---

## Read path

`loadEntriesFromDisk(journalPath)` walks the journal directory and builds a `JournalEntry[]`:

1. `readDir(journalPath)` lists the directory.
2. For each `.md` file, `readTextFile` loads the contents.
3. `parseMarkdown()` splits the file into `{ frontmatter, content }` using the regex `/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/` and `yaml.parse()`.
4. `FrontmatterEntrySchema.safeParse(frontmatter)` validates. On failure, a warning is logged and the entry is treated as plain markdown (body preserved, metadata discarded).
5. Missing fields get fallbacks: `id` → fresh UUID, timestamps → date from filename or `now()`, `tags` → `[]`, `indexed` → `false`.
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

`saveProfileToDisk(profile, journalPath)` writes `profiles/profile.json` and `profiles/psychological-profile.md` next to the journal directory.

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

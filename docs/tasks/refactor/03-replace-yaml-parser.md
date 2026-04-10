# 03 — Replace the Hand-Rolled Frontmatter Parser

## Problem

`src/services/fs.ts:33-63` hand-rolls frontmatter serialization by joining `` `${key}: ${JSON.stringify(value)}` `` on newlines, and `parseMarkdown` splits each line on the first `': '` then `JSON.parse`s the value. The current architecture doc even calls this out: *"The frontmatter is not real YAML — every value is JSON-encoded so the parser can use plain `JSON.parse` instead of pulling in a YAML library"* (`docs/architecture/data-pipeline.md`).

That was a reasonable tradeoff when the journal was only ever written by nopy itself. It is **not** safe now that the architecture doc explicitly documents plain markdown imports as a first-class flow and states that users can edit files in external editors. The current parser breaks on:

- **Multi-line strings.** `summary: "First line\nSecond line"` becomes two lines, the second of which fails to split on `': '` and is silently dropped.
- **Unquoted scalars.** A user hand-editing `tags: [focus, planning]` (valid YAML, no JSON quotes) parses as the raw string `"[focus, planning]"` and fails schema validation.
- **Any YAML feature.** Block scalars (`|`, `>`), anchors, comments — all produce surprising results.

Real data loss scenario: a user edits `tags` in vim, forgets to wrap strings in double quotes (because every other journaling tool uses real YAML), saves the file, clicks Sync in nopy, and their tag data disappears into a `safeParse` failure that loads the entry as unindexed.

## Current Behaviour

### `fs.ts:17-37` — serialization

```typescript
export function entryToMarkdown(entry: JournalEntry): string {
  const frontmatter: Record<string, unknown> = { /* ... */ }
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')
  return `---\n${yaml}\n---\n\n${entry.content}`
}
```

### `fs.ts:40-63` — parsing

```typescript
export function parseMarkdown(text: string): { frontmatter: Record<string, unknown>; content: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, content: text }

  const frontmatter: Record<string, unknown> = {}
  let parseFailures = 0
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(': ')
    if (idx === -1) continue                       // <-- silently drops
    const key = line.slice(0, idx)
    const value = line.slice(idx + 2)
    try {
      frontmatter[key] = JSON.parse(value)
    } catch {
      parseFailures++
      frontmatter[key] = value                      // <-- raw string fallback
    }
  }
  return { frontmatter, content: match[2] }
}
```

### Existing tests that encode the broken contract

- `src/__tests__/schemas/frontmatter.test.ts` — "falls back gracefully on a malformed JSON value in frontmatter"
- `src/__tests__/services/fs.test.ts` — "falls back gracefully on a malformed JSON value in frontmatter"

Both tests assert the current per-line `JSON.parse` fallback behavior. They must be rewritten.

## Desired Behaviour

- Frontmatter is real YAML, serialized and parsed by a proper library.
- The existing round-trip test (`entryToMarkdown → parseMarkdown` with no data loss) continues to pass.
- Multi-line strings, unquoted scalars, and hand-edited whitespace round-trip correctly.
- `FrontmatterEntrySchema` (`src/schemas/frontmatter.ts`) remains the validator — the parser hands it an untyped object, the schema validates shape.
- Malformed YAML throws a clear error that `loadEntriesFromDisk` catches and logs (same pattern as today, just with a real error instead of a silently dropped line).

## Implementation Steps

### 1. Install `yaml`

```bash
npm install yaml
```

`yaml` is a single-dep, zero-runtime-dep, spec-compliant YAML 1.2 parser. `gray-matter` is more popular but pulls in larger dependencies; `yaml` is enough here because the markdown body split (the `---\n...\n---\n\n?` regex) is trivial and already works.

### 2. Rewrite `entryToMarkdown`

```typescript
import { stringify as yamlStringify } from 'yaml'

export function entryToMarkdown(entry: JournalEntry): string {
  const frontmatter: Record<string, unknown> = {
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    tags: entry.tags,
    indexed: entry.indexed,
  }
  if (entry.mood) frontmatter.mood = entry.mood
  if (entry.summary) frontmatter.summary = entry.summary

  const yaml = yamlStringify(frontmatter).trimEnd()
  return `---\n${yaml}\n---\n\n${entry.content}`
}
```

`yamlStringify` handles all quoting, escaping, and multi-line string literals automatically.

### 3. Rewrite `parseMarkdown`

```typescript
import { parse as yamlParse } from 'yaml'

export function parseMarkdown(text: string): { frontmatter: Record<string, unknown>; content: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!match) {
    console.log('[fs] parseMarkdown: no frontmatter found')
    return { frontmatter: {}, content: text }
  }

  try {
    const frontmatter = (yamlParse(match[1]) ?? {}) as Record<string, unknown>
    console.log('[fs] parseMarkdown: frontmatter keys', Object.keys(frontmatter).length)
    return { frontmatter, content: match[2] }
  } catch (e) {
    console.warn('[fs] parseMarkdown: YAML parse failed, treating entry as plain markdown:', e)
    return { frontmatter: {}, content: text }
  }
}
```

The catch block preserves today's "bad frontmatter → plain markdown import" behavior that `loadEntriesFromDisk` depends on. It does **not** catch the broader error — downstream errors (fs read failures) still propagate per task 01.

### 4. Rewrite the two tests

**`src/__tests__/schemas/frontmatter.test.ts`** — delete "falls back gracefully on a malformed JSON value in frontmatter" and replace with a test that constructs malformed YAML, parses it via `parseMarkdown`, and asserts the parser either returns empty frontmatter or the schema rejects the result (whichever is appropriate).

**`src/__tests__/services/fs.test.ts`** — same rewrite, plus add new tests documented in step 5.

### 5. Add regression tests for the cases that motivated the swap

In `src/__tests__/services/fs.test.ts`:

```ts
describe('parseMarkdown with real YAML features', () => {
  it('round-trips a summary that contains newline characters', () => {
    /**
     * Before this refactor the hand-rolled parser split frontmatter on raw
     * newlines and dropped any line that did not contain ": ". A summary
     * containing "\n" in the middle of a string would lose its tail.
     * With real YAML the block-scalar / folded-scalar syntax preserves
     * multi-line strings correctly. This test locks in the round-trip.
     * Input: entry with summary "First line.\nSecond line."
     * Expected output: parseMarkdown(entryToMarkdown(entry)).frontmatter.summary === original
     */
    // ...
  })

  it('parses a hand-edited tags array written in unquoted YAML form', () => {
    /**
     * External editors produce valid YAML like `tags: [focus, planning]`
     * without the JSON string quotes the old parser required. The old parser
     * would have read this as the raw string "[focus, planning]" and failed
     * schema validation, silently losing the tags. This test verifies the
     * new parser handles the normal YAML form.
     * Input: frontmatter block with `tags: [focus, planning]`
     * Expected output: frontmatter.tags === ['focus', 'planning']
     */
    // ...
  })

  it('preserves comments-free hand-edited whitespace in frontmatter', () => {
    /**
     * External editors sometimes reformat frontmatter with extra spaces or
     * trailing whitespace. YAML is whitespace-aware but tolerant of trailing
     * spaces on values. The old parser treated "key: value " and "key: value"
     * as different strings; real YAML normalizes this.
     * Input: frontmatter with "title:  My Entry  " (extra spaces)
     * Expected output: frontmatter.title === 'My Entry'
     */
    // ...
  })

  it('throws or returns empty frontmatter on truly malformed YAML', () => {
    /**
     * A corrupted file (e.g. unclosed bracket, mismatched indentation) must
     * not crash the sync loop. The parser should return empty frontmatter so
     * loadEntriesFromDisk treats the entry as a plain markdown import — the
     * same graceful-degradation behavior the old parser offered via its
     * per-line fallback.
     * Input: frontmatter block "tags: [unclosed"
     * Expected output: frontmatter === {}, content preserved intact
     */
    // ...
  })
})
```

## Files to Modify

- **Modify**: `package.json` — add `yaml` dependency.
- **Modify**: `src/services/fs.ts` — replace `entryToMarkdown` and `parseMarkdown` implementations.
- **Modify**: `src/__tests__/services/fs.test.ts` — rewrite one test, add four new tests.
- **Modify**: `src/__tests__/schemas/frontmatter.test.ts` — rewrite the "malformed JSON" test.
- **Modify**: `docs/architecture/data-pipeline.md` — update the "Markdown format" section to state frontmatter is real YAML (a cross-link from the new `docs/architecture/filesystem-layer.md` will handle the deeper detail).

## Dependencies

None. This task is independent and can land in any order, but ideally lands **before** 01 so fs-error tests can assume a real parser.

## Testing Notes

- Existing round-trip test (`entryToMarkdown` ↔ `parseMarkdown` no data loss) must still pass unmodified.
- All four new YAML-feature tests pass.
- `npm test` green.
- Manual: open a `.md` file from your journal directory in an external editor. Add a multi-line summary and save. Click Sync in nopy. Confirm the summary round-trips correctly and is visible in the entry card. Before this refactor, the second line would be silently dropped.
- Manual: hand-write a new `.md` file with `tags: [focus, planning]` (unquoted), drop it in the journal directory, Sync. Confirm the tags appear on the entry card.

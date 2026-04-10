# 01 — Surface Filesystem and Save Errors

## Problem

Every disk write in `src/services/fs.ts` swallows errors with `try { ... } catch (e) { console.error(...) }` and returns `void`. Callers have no way to distinguish "nothing to do" (no journal path configured) from "the write failed". As a result, `EntryEditor.handleSave` flashes a green "Saved" indicator even when the underlying `writeTextFile` call threw — the user thinks their entry is on disk when it is not.

This is a silent data-loss hazard on the hot path of the app. The nopy data pipeline explicitly documents "writes are not atomic across the three layers" as a known gap (`docs/architecture/data-pipeline.md` — *Write ordering and atomicity*), and this task closes the gap by at least making the failure **visible** to both the store and the user.

A related inconsistency: `anthropic.ts` has two calling conventions. `sendMessage` throws on failure, while `streamChatResponse` uses an `onError` callback for both connection errors and mid-stream errors. Stores have to handle both shapes, which they currently don't.

## Current Behaviour

### `fs.ts:65-91` — `saveEntryToDisk` swallows all errors

```typescript
export async function saveEntryToDisk(entry: JournalEntry, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return

  try {
    const { mkdir, writeTextFile, exists } = await import('@tauri-apps/plugin-fs')
    // ...
    await writeTextFile(filePath, entryToMarkdown(entry))
  } catch (e) {
    console.error('[fs] saveEntryToDisk FAILED:', e)   // <-- swallowed
  }
}
```

`deleteEntryFromDisk` (`fs.ts:93-127`) and `saveProfileToDisk` (`fs.ts:129-148`) follow the same pattern.

### `EntryEditor.tsx:183-200` — success flash fires regardless of disk outcome

```typescript
const handleSave = useCallback(async () => {
  if (saving) return
  setSaving(true)
  try {
    const entryId = await ensureEntry()
    const mood: MoodScore | null = moodValue
      ? { value: moodValue, label: moodValueToLabel(moodValue) }
      : null
    await updateEntry(entryId, { title, content, mood })  // <-- cannot reject
    setDirty(false)
    setJustSaved(true)                                     // <-- always fires
    setTimeout(() => setJustSaved(false), 2000)
  } catch (e) {
    console.error('[editor] Save failed:', e)
  } finally {
    setSaving(false)
  }
}, [saving, ensureEntry, updateEntry, title, content, moodValue])
```

`updateEntry` in `journalStore.ts:52-61` awaits `saveEntryToDisk` but that function returns `void` on failure, so the catch block is unreachable for disk errors.

### `anthropic.ts:17-57` vs `anthropic.ts:71-94` — two error conventions

`streamChatResponse` uses an `onError` callback (both for connection setup errors at line 54 and mid-stream errors at line 49). `sendMessage` throws. Callers have to handle both shapes.

## Desired Behaviour

- Every `fs.ts` write function throws on underlying failure. The `hasFileSystem()` / empty-path early returns stay as no-ops — they are expected cases, not errors.
- Every Zustand store that calls an fs function exposes a `lastError: string | null` field and a `clearLastError()` action. On failure the store populates `lastError` with a human-readable message and re-throws so callers can react.
- `EntryEditor` only flashes "Saved" after the full memory → IndexedDB → disk sequence resolves. On failure it shows an inline red banner reading from `journalStore.lastError`.
- `anthropic.ts` keeps `streamChatResponse`'s `onError` callback for token-delta errors only. Connection/setup errors (anything before the first token) throw so the caller can `try/catch` symmetrically with `sendMessage`.

## Implementation Steps

### 1. Strip silent catches from `fs.ts`

Delete the `try { ... } catch` wrappers in `saveEntryToDisk` (L71-90), `deleteEntryFromDisk` (L96-126), and `saveProfileToDisk` (L132-147). Keep the `hasFileSystem()` and empty-path early returns. Keep the console logging, but move it to log lines before the throwing operations, not inside a catch.

```typescript
export async function saveEntryToDisk(entry: JournalEntry, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return

  const { mkdir, writeTextFile, exists } = await import('@tauri-apps/plugin-fs')
  if (!(await exists(journalPath))) {
    await mkdir(journalPath, { recursive: true })
  }
  const filename = entry.sourceFilename || `${slugify(entry.title, entry.id)}.md`
  await writeTextFile(`${journalPath}/${filename}`, entryToMarkdown(entry))
}
```

### 2. Add `lastError` state to stores

In `journalStore.ts`, extend `JournalState`:

```typescript
interface JournalState {
  // ...existing fields...
  lastError: string | null
  clearLastError: () => void
}
```

Wrap every fs call in the mutation methods. Example for `updateEntry`:

```typescript
updateEntry: async (id, updates) => {
  const entries = getState().entries.map((e) =>
    e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
  )
  setState({ entries, lastError: null })
  await set('nopy-entries', entries)
  const updated = entries.find((e) => e.id === id)
  if (!updated) return
  try {
    await saveEntryToDisk(updated, getJournalPath())
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    setState({ lastError: `Failed to save "${updated.title}" to disk: ${msg}` })
    throw e
  }
},
```

Repeat the same pattern in `addEntry`, `deleteEntry`, `syncFromDisk`, `processEntries`, and `startForceUpdate`. Apply the equivalent change to `profileStore.setProfile` and `chatStore` persistence methods.

### 3. Update `EntryEditor.handleSave`

Move `setJustSaved(true)` so it only fires on the resolved path, and rely on `journalStore.lastError` for the failure message:

```typescript
const handleSave = useCallback(async () => {
  if (saving) return
  setSaving(true)
  try {
    const entryId = await ensureEntry()
    const mood: MoodScore | null = moodValue
      ? { value: moodValue, label: moodValueToLabel(moodValue) }
      : null
    await updateEntry(entryId, { title, content, mood })
    setDirty(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  } catch (e) {
    console.error('[editor] Save failed:', e)
    // Banner renders from useJournalStore(s => s.lastError)
  } finally {
    setSaving(false)
  }
}, [saving, ensureEntry, updateEntry, title, content, moodValue])
```

Add an inline banner in the editor JSX that renders when `lastError` is non-null with a dismiss button calling `clearLastError()`.

### 4. Reconcile `anthropic.ts` error conventions

In `streamChatResponse`, remove the outer `try/catch` and let setup errors throw. Keep the stream's `'error'` handler calling `onError` for mid-stream errors only:

```typescript
export async function streamChatResponse(...): Promise<void> {
  const client = getClient(apiKey)                   // throws on bad key
  const stream = client.messages.stream({ ... })     // throws on setup failure

  let fullText = ''
  stream.on('text', (text) => { fullText += text; onChunk(fullText) })
  stream.on('finalMessage', () => { onComplete(fullText) })
  stream.on('error', (error) => {
    onError(error instanceof Error ? error : new Error(String(error)))
  })
}
```

Update `ChatView.handleSend` to `try { await streamChatResponse(...) } catch (e) { /* show error banner */ }` for setup errors, while still passing `onError` for delta-level errors.

## Files to Modify

- **Modify**: `src/services/fs.ts` — remove silent catches from `saveEntryToDisk`, `deleteEntryFromDisk`, `saveProfileToDisk`, `loadEntriesFromDisk`.
- **Modify**: `src/services/anthropic.ts` — let connection errors throw in `streamChatResponse`.
- **Modify**: `src/stores/journalStore.ts` — add `lastError` + `clearLastError`, wrap fs calls in try/catch + re-throw.
- **Modify**: `src/stores/profileStore.ts` — same pattern for `setProfile` and the generation pipeline.
- **Modify**: `src/stores/chatStore.ts` — same pattern for session persistence.
- **Modify**: `src/components/journal/EntryEditor.tsx` — render `lastError` banner; ensure `setJustSaved` only fires on success.
- **Modify**: `src/components/chat/ChatView.tsx` — handle setup errors with try/catch around `streamChatResponse`.

## Dependencies

Requires `13 — Test infrastructure` to be completed first so `@testing-library/react` is installed and store tests can run.

## Testing Notes

### Manual

1. Set the journal path to a read-only directory (e.g. `/` on macOS).
2. Create or edit an entry and click Save.
3. **Expected:** red "Save failed" banner appears; no green "Saved" flash; `journalStore.lastError` is populated.
4. Dismiss the banner and point the journal path back at a writable directory.
5. Save again. **Expected:** green "Saved" flash; `lastError` cleared.

### Unit

Extend `src/__tests__/services/fs.test.ts` with the following additions (every `it()` gets a JSDoc docstring per the convention):

```ts
import { vi } from 'vitest'
vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  remove: vi.fn(),
}))

describe('saveEntryToDisk error propagation', () => {
  it('throws when the underlying writeTextFile rejects', async () => {
    /**
     * Before this refactor, fs.saveEntryToDisk swallowed all errors with a
     * console.error and returned void — callers could not tell a failed save
     * from a successful one, and EntryEditor still flashed "Saved" on failure.
     * This test locks in the new contract: write failures propagate as
     * rejected promises so stores can populate lastError.
     * Input: writeTextFile mock that rejects with "disk full"
     * Expected output: saveEntryToDisk rejects with the same error
     */
    // ...
  })
})
```

Create `src/__tests__/stores/journalStore.test.ts` with a test asserting `updateEntry` populates `lastError` when `saveEntryToDisk` throws, and clears it on the next successful call. See `13 — Test infrastructure` for the store-test harness.

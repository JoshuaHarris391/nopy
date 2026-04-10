# 09 — Decouple Cross-Store State Mutations

## Problem

Zustand stores in nopy are supposed to own their own state, but two patterns violate that boundary:

1. **`profileStore` reaches into `journalStore`'s state.** At `src/stores/profileStore.ts:58-74`, the profile generation pipeline reads `useJournalStore.getState().entries`, maps them into updated entries, writes back via `useJournalStore.setState({ entries: updated })`, and manually calls `set('nopy-entries', updated)` and `saveEntryToDisk(...)`. This bypasses `journalStore.processEntries` (`journalStore.ts:143-169`) which does the exact same operation through proper store methods.

2. **`SettingsView` calls `setState` on stores directly.** At `src/components/settings/SettingsView.tsx:41-52` (approximately), the component calls `useJournalStore.setState({...})` and `useProfileStore.setState({...})` directly to implement "reset all data" — bypassing any store-defined actions and making the component aware of internal store shape.

These patterns make it impossible to add cross-cutting concerns (e.g. `lastError` from task 01, audit logging, undo) because the stores' action methods are not the only write path.

## Current Behaviour

### `profileStore.ts:58-74` — bypasses journalStore

```typescript
if (results.size > 0) {
  const journalStore = useJournalStore.getState()
  const now = new Date().toISOString()
  const updated = journalStore.entries.map((e) => {
    const meta = results.get(e.id)
    if (!meta) return e
    return { ...e, mood: meta.mood, tags: meta.tags, summary: meta.summary, indexed: true, updatedAt: now }
  })
  useJournalStore.setState({ entries: updated })      // <-- direct setState
  await set('nopy-entries', updated)                   // <-- manual idb-keyval
  const journalPath = useSettingsStore.getState().journalPath
  for (const [id] of results) {
    const entry = updated.find((e) => e.id === id)
    if (entry) await saveEntryToDisk(entry, journalPath)  // <-- manual disk write
  }
}
```

Compare with `journalStore.processEntries` at `journalStore.ts:143-169`, which does the identical merge-and-persist operation through the store's own methods:

```typescript
const updated = entries.map((e) => {
  const meta = results.get(e.id)
  if (!meta) return e
  return { ...e, mood: meta.mood, tags: meta.tags, summary: meta.summary, indexed: true, updatedAt: now }
})
setState({ entries: updated })
await set('nopy-entries', updated)
for (const [id] of results) { /* same disk write loop */ }
```

The duplication means any fix to the write path (e.g. task 01's error surfacing) must be applied in both places.

### `SettingsView` — direct `setState`

```typescript
// Approximate — SettingsView "Delete All Data" handler
useJournalStore.setState({ entries: [], loaded: false })
useProfileStore.setState({ profile: null, loaded: false })
await del('nopy-entries')
await del('nopy-profile')
```

No store action is called; the component is coupled to internal state shape.

## Desired Behaviour

- Stores only cross-talk via explicit action methods (e.g. `journalStore.applyProcessedMetadata(results)`).
- Components never call `setState` on a store — they call actions.
- The profile generation pipeline delegates entry mutation back to `journalStore`.
- A new `clear()` action on each store handles the "reset all data" flow.

## Implementation Steps

### 1. Add `applyProcessedMetadata` to `journalStore`

```typescript
applyProcessedMetadata: async (results: Map<string, { mood: MoodScore | null; tags: string[]; summary: string }>) => {
  if (results.size === 0) return
  const now = new Date().toISOString()
  const entries = getState().entries.map((e) => {
    const meta = results.get(e.id)
    if (!meta) return e
    return { ...e, ...meta, indexed: true, updatedAt: now }
  })
  setState({ entries })
  await set('nopy-entries', entries)
  const journalPath = getJournalPath()
  for (const [id] of results) {
    const entry = entries.find((e) => e.id === id)
    if (entry) await saveEntryToDisk(entry, journalPath)
  }
}
```

This is the same logic that currently exists at `journalStore.ts:150-168` (inside `processEntries`) and `profileStore.ts:60-72`. After extraction, `processEntries` calls `applyProcessedMetadata`, and `profileStore.generateProfile` calls `useJournalStore.getState().applyProcessedMetadata(results)`.

### 2. Add `clear()` to both stores

`journalStore`:

```typescript
clear: async () => {
  setState({ entries: [], loaded: false })
  await del('nopy-entries')
}
```

`profileStore`:

```typescript
clear: async () => {
  setState({ profile: null, loaded: false })
  await del('nopy-profile')
}
```

### 3. Rewrite `profileStore.generateProfile` Step 1

Replace `profileStore.ts:57-75` with:

```typescript
if (results.size > 0) {
  await useJournalStore.getState().applyProcessedMetadata(results)
  entries = useJournalStore.getState().entries  // re-read updated entries
}
```

### 4. Rewrite `SettingsView` "Delete All Data" handler

Replace:

```typescript
useJournalStore.setState({ entries: [], loaded: false })
useProfileStore.setState({ profile: null, loaded: false })
await del('nopy-entries')
await del('nopy-profile')
```

With:

```typescript
await useJournalStore.getState().clear()
await useProfileStore.getState().clear()
```

### 5. Add ESLint convention comment

Add a comment at the top of each store file:

```typescript
// Convention: components and other stores must use actions, never setState directly.
// See docs/architecture/state-management.md for boundary rules.
```

## Files to Modify

- **Modify**: `src/stores/journalStore.ts` — add `applyProcessedMetadata`, `clear`; refactor `processEntries` to use `applyProcessedMetadata`.
- **Modify**: `src/stores/profileStore.ts` — add `clear`; rewrite Step 1 of `generateProfile` to delegate to `journalStore.applyProcessedMetadata`.
- **Modify**: `src/components/settings/SettingsView.tsx` — replace direct `setState` with store `clear()` actions.

## Dependencies

None, but should land **before** task 01 (so the `lastError` field is only added to action methods, not to inline `setState` calls) and before task 06 (so the settings sections use proper actions).

## Testing Notes

### Unit

Create `src/__tests__/stores/journalStore.test.ts` and `src/__tests__/stores/profileStore.test.ts`:

```ts
describe('journalStore.applyProcessedMetadata', () => {
  it('merges metadata into matching entries and marks them indexed', () => {
    /**
     * The profile generation pipeline processes entries via Haiku and writes
     * the results back. This method is the single entry point for that
     * mutation. It must update mood, tags, summary, and indexed flag on
     * matching entries, bump updatedAt, and persist to IndexedDB.
     * Input: store with 3 entries, results map with metadata for 2 of them
     * Expected output: 2 entries updated with new metadata and indexed=true;
     *   1 entry unchanged; IndexedDB written with the merged array
     */
  })

  it('is a no-op when the results map is empty', () => {
    /**
     * When no entries were processed (e.g. all already indexed), the method
     * must not write to IndexedDB or trigger a state update.
     * Input: store with entries, empty results map
     * Expected output: no setState call, no idb-keyval write
     */
  })
})

describe('journalStore.clear', () => {
  it('empties entries and resets loaded flag', () => {
    /**
     * The "Delete All Data" flow in Settings wipes the journal cache.
     * This action encapsulates that so the component never calls setState
     * directly on the store.
     * Input: store with 5 entries
     * Expected output: entries === [], loaded === false, idb-keyval 'nopy-entries' deleted
     */
  })
})
```

### Manual

1. Open the app with entries loaded. Click "Generate Profile" in the Profile view.
2. Confirm that entries get indexed (check the entry cards for mood/tags/summary).
3. Open Settings → "Delete All Data". Confirm entries and profile are cleared.
4. Refresh the app. Confirm the state is clean (no phantom entries from IndexedDB).

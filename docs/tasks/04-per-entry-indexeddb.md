# 04 — Per-Entry IndexedDB Storage

## Problem

All journal entries are stored as a single monolithic array under the IndexedDB key `nopy-entries`. Every add, edit, delete, sync, or process operation serialises and writes the **entire array**. At 1,825 entries (~4-5MB), this causes noticeable write latency on every operation. During a full reindex (`processEntries` with `force: true`), the full blob is rewritten once per processed entry — 1,825 × 5MB = ~9GB of cumulative writes.

## Current Behaviour

The key `nopy-entries` is written in **6 places** across 2 stores:

### `src/stores/journalStore.ts`
- `addEntry` (line 47): `await set('nopy-entries', entries)`
- `updateEntry` (line 56): `await set('nopy-entries', entries)`
- `deleteEntry` (line 65): `await set('nopy-entries', entries)`
- `syncFromDisk` (line 124): `await set('nopy-entries', result)`
- `processEntries` (line 156): `await set('nopy-entries', updated)`

### `src/stores/profileStore.ts`
- `generateProfile` step 1 (line 63): `await set('nopy-entries', updated)`

### Load path
- `loadEntries` (line 40): `const entries = await get<JournalEntry[]>('nopy-entries')`

This loads the entire array into memory on app start via `get('nopy-entries')`.

## Desired Behaviour

- Each entry is stored under its own key: `entry:<id>`
- A lightweight index of entry IDs + metadata is stored separately: `entry-index`
- Single-entry operations (add, edit, delete) only write one entry + update the index
- Bulk operations (sync, process) batch writes efficiently
- Migration: on first load, detect the old `nopy-entries` key, migrate to per-entry storage, then delete the old key

## Implementation Steps

### 1. Define the index type

```typescript
interface EntryIndexItem {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  indexed: boolean
  sourceFilename?: string
}
```

The index is small (~100 bytes per entry × 1,825 = ~180KB) and fast to write on every operation.

### 2. Create helper functions

Create `src/services/entryStorage.ts`:

```typescript
import { get, set, del, keys } from 'idb-keyval'
import type { JournalEntry } from '../types/journal'

const INDEX_KEY = 'entry-index'
const ENTRY_PREFIX = 'entry:'
const LEGACY_KEY = 'nopy-entries'

interface EntryIndexItem {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  indexed: boolean
  sourceFilename?: string
}

export async function migrateIfNeeded(): Promise<boolean> {
  const legacy = await get<JournalEntry[]>(LEGACY_KEY)
  if (!legacy || legacy.length === 0) return false
  
  // Write each entry individually
  for (const entry of legacy) {
    await set(`${ENTRY_PREFIX}${entry.id}`, entry)
  }
  
  // Write the index
  const index: EntryIndexItem[] = legacy.map(toIndexItem)
  await set(INDEX_KEY, index)
  
  // Delete legacy key
  await del(LEGACY_KEY)
  return true
}

export async function loadIndex(): Promise<EntryIndexItem[]> {
  return (await get<EntryIndexItem[]>(INDEX_KEY)) ?? []
}

export async function loadEntry(id: string): Promise<JournalEntry | undefined> {
  return get<JournalEntry>(`${ENTRY_PREFIX}${id}`)
}

export async function loadAllEntries(): Promise<JournalEntry[]> {
  const index = await loadIndex()
  const entries: JournalEntry[] = []
  for (const item of index) {
    const entry = await get<JournalEntry>(`${ENTRY_PREFIX}${item.id}`)
    if (entry) entries.push(entry)
  }
  return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function saveEntry(entry: JournalEntry): Promise<void> {
  await set(`${ENTRY_PREFIX}${entry.id}`, entry)
  const index = await loadIndex()
  const existing = index.findIndex((i) => i.id === entry.id)
  const item = toIndexItem(entry)
  if (existing >= 0) {
    index[existing] = item
  } else {
    index.unshift(item)
  }
  await set(INDEX_KEY, index)
}

export async function removeEntry(id: string): Promise<void> {
  await del(`${ENTRY_PREFIX}${id}`)
  const index = await loadIndex()
  await set(INDEX_KEY, index.filter((i) => i.id !== id))
}

export async function bulkSaveEntries(entries: JournalEntry[]): Promise<void> {
  for (const entry of entries) {
    await set(`${ENTRY_PREFIX}${entry.id}`, entry)
  }
  const index = entries.map(toIndexItem)
  await set(INDEX_KEY, index)
}

function toIndexItem(entry: JournalEntry): EntryIndexItem {
  return {
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    indexed: entry.indexed,
    sourceFilename: entry.sourceFilename,
  }
}
```

### 3. Update `src/stores/journalStore.ts`

Replace all `set('nopy-entries', entries)` calls and the `get('nopy-entries')` call with the new helper functions:

- `loadEntries`: call `migrateIfNeeded()` first, then `loadAllEntries()`
- `addEntry`: call `saveEntry(entry)` instead of writing the full array
- `updateEntry`: call `saveEntry(updated)` for just the one entry
- `deleteEntry`: call `removeEntry(id)`
- `syncFromDisk`: call `bulkSaveEntries(result)` at the end
- `processEntries`: call `saveEntry(entry)` per processed entry instead of writing the full array

### 4. Update `src/stores/profileStore.ts`

Line 63: replace `await set('nopy-entries', updated)` with a loop calling `saveEntry()` for each entry that was updated by processing.

### 5. Update `src/stores/profileStore.ts` — also remove direct `idb-keyval` import

Replace:
```typescript
import { get, set } from 'idb-keyval'
```
With imports from the new `entryStorage` module where entry operations are needed. Keep `idb-keyval` for profile storage (`nopy-profile` key is fine as-is — it's a single object).

## Files to Modify

- **New**: `src/services/entryStorage.ts`
- **Modify**: `src/stores/journalStore.ts` — replace all 5 `set('nopy-entries', ...)` calls and the `get('nopy-entries')` call
- **Modify**: `src/stores/profileStore.ts` — replace the `set('nopy-entries', ...)` call on line 63

## Dependencies

None — uses the existing `idb-keyval` package.

## Testing Notes

- **Migration**: Start with existing data in `nopy-entries`. After loading, verify the old key is gone and entries exist under `entry:<id>` keys. Check via DevTools → Application → IndexedDB → keyval-store.
- **Add entry**: Verify only one `entry:<id>` key is written (not the full array). Check that `entry-index` is updated.
- **Edit entry**: Verify only the changed entry's key is updated.
- **Delete entry**: Verify the entry key is removed and the index is updated.
- **Sync from disk**: Verify all entries are written individually and the index reflects the full set.
- **Process entries**: Monitor IndexedDB writes during a force reindex — should see individual entry writes, not a 5MB blob per entry.
- **Profile generation**: Verify the entry updates during step 1 use per-entry writes.

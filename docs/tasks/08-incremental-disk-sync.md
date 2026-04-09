# 08 — Incremental Disk Sync via File Modification Times

## Problem

`syncFromDisk` reads **every** `.md` file in the journal directory, parses frontmatter, and rebuilds the full entry array. At 1,825 files, this means 1,825 sequential file reads via Tauri's FS plugin, taking 2-5 seconds on cold start. This runs on every app launch and on manual sync triggers.

## Current Behaviour

`src/services/fs.ts:158-215`:
```typescript
export async function loadEntriesFromDisk(journalPath: string): Promise<JournalEntry[]> {
  const dirEntries = await readDir(journalDir)

  for (const file of dirEntries) {
    if (!file.name?.endsWith('.md')) continue
    try {
      const text = await readTextFile(`${journalDir}/${file.name}`)
      const { frontmatter, content } = parseMarkdown(text)
      // ... build entry from frontmatter
      entries.push({ ... })
    } catch (e) {
      console.error('[fs] Error reading entry file:', file.name, e)
    }
  }
  return entries.sort(...)
}
```

`src/stores/journalStore.ts:69-138` — `syncFromDisk`:
```typescript
const diskEntries = await loadEntriesFromDisk(journalPath)
// ... diff against existing, merge, write back
```

Every call reads all files regardless of whether they've changed.

## Desired Behaviour

- On first sync (no previous sync data): full read of all files (same as current)
- On subsequent syncs: only read files that are new or modified since the last sync
- Track a `lastSyncTimestamp` and per-file modification times
- Detect deleted files by comparing directory listing against known files
- Fall back to full sync if the sync metadata is missing or corrupted

## Implementation Steps

### 1. Store sync metadata

Create a sync state structure stored in IndexedDB:

```typescript
interface SyncMetadata {
  lastSyncAt: string            // ISO timestamp of last sync
  files: Record<string, {       // keyed by filename
    mtime: number               // file modification time (ms since epoch)
    entryId: string             // the entry ID parsed from this file
  }>
}
```

Store under IndexedDB key `sync-metadata`.

### 2. Get file modification times from Tauri

Tauri's `@tauri-apps/plugin-fs` provides `stat()` which returns file metadata including modification time:

```typescript
import { stat } from '@tauri-apps/plugin-fs'

const fileStat = await stat(`${journalDir}/${file.name}`)
const mtime = fileStat.mtime?.getTime() ?? 0
```

Check the exact Tauri v2 API — `stat` may return `{ mtime: Date | null }`. Use `readDir` to list files, then `stat` each to get mtimes.

### 3. Create `src/services/incrementalSync.ts`

```typescript
import { get, set } from 'idb-keyval'
import type { JournalEntry } from '../types/journal'

const SYNC_META_KEY = 'sync-metadata'

interface SyncMetadata {
  lastSyncAt: string
  files: Record<string, { mtime: number; entryId: string }>
}

interface SyncResult {
  entries: JournalEntry[]
  added: number
  updated: number
  removed: number
  fullSync: boolean
}

export async function incrementalSync(
  journalPath: string,
  existingEntries: JournalEntry[],
): Promise<SyncResult> {
  const { readDir, readTextFile, stat, exists } = await import('@tauri-apps/plugin-fs')
  
  if (!(await exists(journalPath))) {
    return { entries: [], added: 0, updated: 0, removed: 0, fullSync: false }
  }
  
  const syncMeta = await get<SyncMetadata>(SYNC_META_KEY)
  const dirFiles = await readDir(journalPath)
  const mdFiles = dirFiles.filter((f) => f.name?.endsWith('.md'))
  
  // If no previous sync metadata, do a full sync
  if (!syncMeta) {
    const entries = await fullSync(journalPath, mdFiles)
    return {
      entries,
      added: entries.length,
      updated: 0,
      removed: 0,
      fullSync: true,
    }
  }
  
  // Incremental: check mtimes
  const newMeta: SyncMetadata = { lastSyncAt: new Date().toISOString(), files: {} }
  const existingById = new Map(existingEntries.map((e) => [e.id, e]))
  const result = [...existingEntries]
  let added = 0, updated = 0, removed = 0
  
  const currentFilenames = new Set<string>()
  
  for (const file of mdFiles) {
    if (!file.name) continue
    currentFilenames.add(file.name)
    
    const fileStat = await stat(`${journalPath}/${file.name}`)
    const mtime = fileStat.mtime?.getTime() ?? 0
    const previousFile = syncMeta.files[file.name]
    
    if (previousFile && previousFile.mtime === mtime) {
      // Unchanged — keep existing entry, carry forward metadata
      newMeta.files[file.name] = previousFile
      continue
    }
    
    // New or modified — read and parse
    const text = await readTextFile(`${journalPath}/${file.name}`)
    const entry = parseMarkdownToEntry(text, file.name)  // reuse existing parseMarkdown logic
    
    const existingIndex = result.findIndex((e) => e.id === entry.id)
    if (existingIndex >= 0) {
      result[existingIndex] = entry
      updated++
    } else {
      result.push(entry)
      added++
    }
    
    newMeta.files[file.name] = { mtime, entryId: entry.id }
  }
  
  // Detect deletions: files in previous sync but not in current directory
  for (const [filename, meta] of Object.entries(syncMeta.files)) {
    if (!currentFilenames.has(filename)) {
      const idx = result.findIndex((e) => e.id === meta.entryId)
      if (idx >= 0) {
        result.splice(idx, 1)
        removed++
      }
    }
  }
  
  // Save sync metadata
  await set(SYNC_META_KEY, newMeta)
  
  result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return { entries: result, added, updated, removed, fullSync: false }
}
```

### 4. Update `src/stores/journalStore.ts`

Replace `syncFromDisk` to use `incrementalSync`:

```typescript
syncFromDisk: async () => {
  const journalPath = getJournalPath()
  if (!journalPath) return { added: 0, updated: 0, removed: 0 }
  
  setState({ syncing: true })
  try {
    const result = await incrementalSync(journalPath, getState().entries)
    setState({ entries: result.entries })
    // Update IndexedDB (use per-entry storage if task 04 is done, otherwise set('nopy-entries', result.entries))
    
    if (result.fullSync) {
      console.log(`[sync] Full sync: ${result.added} entries loaded`)
    } else {
      console.log(`[sync] Incremental: ${result.added} added, ${result.updated} updated, ${result.removed} removed`)
    }
    
    return { added: result.added, updated: result.updated, removed: result.removed }
  } finally {
    setState({ syncing: false })
  }
},
```

### 5. Provide a "force full sync" option

Add a way for the user to trigger a full resync (clearing sync metadata):

```typescript
forceFullSync: async () => {
  await del(SYNC_META_KEY)
  return getState().syncFromDisk()
},
```

## Files to Modify

- **New**: `src/services/incrementalSync.ts`
- **Modify**: `src/stores/journalStore.ts` — replace `syncFromDisk` implementation, add `forceFullSync`
- **Modify**: `src/services/fs.ts` — extract `parseMarkdownToEntry` as a reusable function (currently the parsing logic is inline in `loadEntriesFromDisk`)

## Dependencies

None — uses existing `@tauri-apps/plugin-fs` (which supports `stat`).

## Testing Notes

- **First sync**: Delete `sync-metadata` from IndexedDB. Trigger sync. Verify all files are read (console should show full sync message). Verify `sync-metadata` is populated in IndexedDB.
- **Unchanged files**: Trigger sync again without modifying any files. Verify no files are re-read (console should show 0 added, 0 updated, 0 removed). This should be near-instant.
- **Modified file**: Edit a markdown file on disk (change content). Trigger sync. Verify only that file is re-read and the entry is updated.
- **New file**: Add a new `.md` file to the journal directory. Trigger sync. Verify it's detected as added.
- **Deleted file**: Remove a `.md` file from the journal directory. Trigger sync. Verify the corresponding entry is removed.
- **Corrupted metadata**: Manually corrupt `sync-metadata` in IndexedDB. Trigger sync. Verify it falls back to full sync gracefully.
- **Force full sync**: Use the force option. Verify all files are re-read regardless of mtimes.
- **Performance**: With 100+ files, measure sync time for incremental (should be <100ms) vs full (should be 1-3s).

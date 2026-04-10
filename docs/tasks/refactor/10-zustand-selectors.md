# 10 — Replace Full Store Destructures with Zustand Selectors

## Problem

Every major view component destructures the entire Zustand store return value. This means **any** state change in the store — even unrelated fields — triggers a re-render of the component. The worst case is `EntryEditor`, which re-renders on every `forceProgress` tick during background indexing even though the editor doesn't display progress.

| File | Line | Store | Problem |
|---|---|---|---|
| `EntryEditor.tsx` | ~105 | `useJournalStore()` | `forceProgress` ticking re-renders editor mid-typing |
| `SettingsView.tsx` | ~13 | `useSettingsStore()` | Every setting change re-renders entire view |
| `ChatView.tsx` | ~18 | `useSettingsStore()`, `useChatStore()` | `sessions` update re-renders chat including scroll container |
| `ProfileView.tsx` | ~14 | `useProfileStore()`, `useJournalStore()` | Any entry mutation re-renders profile |
| `IndexView.tsx` | ~10 | `useJournalStore()` | Same as above |

## Current Behaviour

### `EntryEditor.tsx:105` (approximate)

```typescript
const { entries, addEntry, updateEntry, deleteEntry } = useJournalStore()
```

This subscribes to the entire store. When `startForceUpdate` ticks `forceProgress` every few seconds, the editor receives a new object reference and re-renders — even though it only needs `entries`, `addEntry`, `updateEntry`, and `deleteEntry`.

### `ChatView.tsx:18` (approximate)

```typescript
const { apiKey, selectedModel, ... } = useSettingsStore()
const { sessions, activeSession, ... } = useChatStore()
```

Same issue — every streaming token appended to `activeSession.messages` triggers a full chat-panel re-render, including the session list sidebar.

## Desired Behaviour

- Each component subscribes only to the fields it reads.
- Zustand's built-in selector prevents re-renders when unread fields change.
- Two approaches are acceptable:
  - **Per-field selectors**: `const entries = useJournalStore(s => s.entries)`
  - **Shallow multi-field selectors**: `const { entries, addEntry } = useJournalStore(useShallow(s => ({ entries: s.entries, addEntry: s.addEntry })))`

## Implementation Steps

### 1. Prioritize the hot paths

Start with the two components that are most performance-sensitive:

- `EntryEditor` — user is actively typing; any unnecessary re-render is noticeable as input lag.
- `ChatView` — streaming tokens arrive rapidly; the scroll-to-bottom effect fires per re-render.

### 2. Replace destructures in `EntryEditor`

```typescript
// Before
const { entries, addEntry, updateEntry, deleteEntry } = useJournalStore()

// After
const entries = useJournalStore(s => s.entries)
const addEntry = useJournalStore(s => s.addEntry)
const updateEntry = useJournalStore(s => s.updateEntry)
const deleteEntry = useJournalStore(s => s.deleteEntry)
```

Action references are stable (created once inside `create()`), so selectors for them never trigger re-renders.

### 3. Replace destructures in `ChatView`

```typescript
const apiKey = useSettingsStore(s => s.apiKey)
const selectedModel = useSettingsStore(s => s.selectedModel)
const activeSession = useChatStore(s => s.activeSession)
const addMessage = useChatStore(s => s.addMessage)
// ...etc
```

### 4. Replace destructures in remaining views

Apply the same pattern to `SettingsView`, `ProfileView`, `IndexView`, and `Sidebar`.

### 5. Verify with React DevTools

Open React DevTools profiler. Record a typing session in the editor while a background force-update is running. Before: editor re-renders per progress tick. After: editor only re-renders on its own state changes.

## Files to Modify

- **Modify**: `src/components/journal/EntryEditor.tsx` — per-field selectors.
- **Modify**: `src/components/chat/ChatView.tsx` — per-field selectors.
- **Modify**: `src/components/settings/SettingsView.tsx` — per-field selectors (or per-section after task 06).
- **Modify**: `src/components/profile/ProfileView.tsx` — per-field selectors.
- **Modify**: `src/components/index/IndexView.tsx` — per-field selectors.
- **Modify**: `src/components/sidebar/Sidebar.tsx` — per-field selectors.

## Dependencies

None, but pairs well with task 05 (EntryEditor split) and task 06 (SettingsView split) — the selectors should be applied as part of those splits.

## Testing Notes

### Manual (primary verification method)

1. Open the app and start a force-update from Settings or the Index view.
2. While the force-update is running (progress ticking), switch to the editor and start typing.
3. **Before fix:** React DevTools profiler shows the editor re-rendering every few seconds (matching `forceProgress` updates).
4. **After fix:** editor only re-renders on keystroke, save, and mood change.
5. Open a chat session and send a message. While the response streams in, confirm the session list sidebar does not re-render per token.

### Automated

No unit tests — re-render optimization is a profiler concern, not a correctness concern. `npm run build` and `npm test` must still pass (ensures no selector typos broke type checking or existing tests).

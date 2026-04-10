# 14 — Miscellaneous Performance Fixes and Cleanup

## Problem

A collection of small improvements that don't warrant individual task files. Each is low-risk and low-effort, but together they reduce noise and improve consistency.

## Items

### 14a. Memoize `filtered` in `IndexView`

**File**: `src/components/index/IndexView.tsx:58-67`

The `filtered` array recomputes on every render, including unrelated store changes. Wrap in `useMemo`:

```typescript
const filtered = useMemo(() => {
  if (!debouncedSearch) return entries
  const q = debouncedSearch.toLowerCase()
  return entries.filter((e) =>
    e.title.toLowerCase().includes(q) ||
    e.content.toLowerCase().includes(q) ||
    e.tags.some((t) => t.toLowerCase().includes(q)) ||
    (e.summary?.toLowerCase().includes(q) ?? false)
  )
}, [entries, debouncedSearch])
```

Note: if task `docs/tasks/03-search-debounce.md` has already been implemented, `debouncedSearch` exists. If not, use `search` and do both at once.

### 14b. Memoize `getWindow` result in `MoodTimeline`

**File**: `src/components/profile/MoodTimeline.tsx:162` (approx)

`getWindow(range, offset)` is called outside any memo, producing fresh `Date` objects on every render. The downstream `points` useMemo depends on `winStart.getTime()` and `winEnd.getTime()`, but the references change each render, causing the memo to recompute.

```typescript
const { start: winStart, end: winEnd } = useMemo(
  () => getWindow(range, offset),
  [range, offset],
)
```

### 14c. Replace `NavItem` hover state with CSS

**File**: `src/components/sidebar/Sidebar.tsx:209-262`

`NavItem` tracks hover in local state (`useState`) only to flip a text/icon color on `mouseEnter`/`mouseLeave`. This triggers 5 re-renders per mouse-over × 5 nav items. Replace with a CSS `:hover` selector on the `<a>` or `<button>` element.

### 14d. Replace `setTimeout` hack in `ChatView`

**File**: `src/components/chat/ChatView.tsx:213` (approx)

A `setTimeout(..., 100)` is used to sequence a scroll or state update after streaming completes. Replace with an awaited store action or a `useEffect` that reacts to the finalized message state.

### 14e. Normalize British/American naming

Mixed naming conventions across the codebase:

| British | American | File |
|---|---|---|
| `finaliseStreamingMessage` | — | `chatStore.ts` |
| `entriesAnalysed` | — | `profileStore.ts`, `types/profile.ts` |
| — | `syncFromDisk` | `journalStore.ts` |

Pick **one** convention (recommend American to match React ecosystem norms) and rename. Use `Edit` with `replace_all` for each term. Update all consumers, types, and test assertions.

### 14f. Add barrel exports

No directory in `src/` has an `index.ts` barrel export. Components like `ProfileView.tsx` have 10-line import blocks. Add `index.ts` to:

- `src/components/ui/` — re-export `Button`, `MoodDot`, `ProgressBar`, `EmptyState`, `MainHeader`, `Tag`, and the new primitives from tasks 04/07/11.
- `src/stores/` — re-export all stores.
- `src/utils/` — re-export `tokenEstimator` and `mood` (after task 04).
- `src/types/` — re-export all type files.
- `src/schemas/` — re-export all schema files.
- `src/services/` — re-export service modules.

### 14g. Create `utils/logger.ts`

**Files**: `src/services/contextAssembler.ts` (~20 `console.log` calls, some emoji-prefixed), `src/services/fs.ts`, `src/services/entryProcessor.ts`

The `[module] ...` prefix convention is consistent — formalize it:

```typescript
export function createLogger(module: string) {
  const enabled = !import.meta.env.PROD  // silent in production builds
  return {
    log: (...args: unknown[]) => enabled && console.log(`[${module}]`, ...args),
    warn: (...args: unknown[]) => enabled && console.warn(`[${module}]`, ...args),
    error: (...args: unknown[]) => console.error(`[${module}]`, ...args),  // always log errors
  }
}
```

Replace scattered `console.log('[contextAssembler] ...')` calls with `const log = createLogger('contextAssembler'); log.log(...)`. Don't rewrite the log content — just route it.

### 14h. Add `aria-label` to icon buttons

**File**: `src/components/journal/EntryEditor.tsx:278` — delete button uses `title` but no `aria-label`. Screen readers may not announce the `title` attribute.

Add `aria-label="Delete entry"` to the trash icon button and `aria-label="Increase font size"` / `aria-label="Decrease font size"` to the typography controls (L393-433). If task 05 extracts `EditorToolbar`, add the labels there.

## Files to Modify

- **Modify**: `src/components/index/IndexView.tsx` — useMemo (14a)
- **Modify**: `src/components/profile/MoodTimeline.tsx` — useMemo (14b)
- **Modify**: `src/components/sidebar/Sidebar.tsx` — CSS hover (14c)
- **Modify**: `src/components/chat/ChatView.tsx` — remove setTimeout (14d)
- **Modify**: multiple files — rename British to American (14e)
- **New**: `index.ts` in 6 directories (14f)
- **New**: `src/utils/logger.ts` (14g)
- **Modify**: `src/services/contextAssembler.ts`, `src/services/fs.ts`, `src/services/entryProcessor.ts` — use logger (14g)
- **Modify**: `src/components/journal/EntryEditor.tsx` — aria-labels (14h)

## Dependencies

None. This task should land **last** to avoid merge conflicts with other refactor PRs.

## Testing Notes

- `npm run build` — no type errors from renames or barrel exports.
- `npm test` — existing tests pass (rename tests if they reference old identifiers like `entriesAnalysed`).
- Manual: type in the editor, confirm no visual regressions from the perf changes.
- Manual: hover nav items in the sidebar, confirm color changes still work via CSS.
- Manual: open a production build (`npm run build && npm run preview`), confirm no console.log noise from the logger (only errors should appear).

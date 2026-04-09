# 03 — Debounce Search Input in IndexView

## Problem

The search filter in `src/components/index/IndexView.tsx` runs on every keystroke, scanning all entries' `title`, `content`, `tags`, and `summary` fields via `.toLowerCase().includes()`. At 1,825 entries this causes unnecessary computation on every character typed, potentially blocking the UI thread for 30-100ms per keystroke.

## Current Behaviour

```typescript
// src/components/index/IndexView.tsx:16
const [search, setSearch] = useState('')

// src/components/index/IndexView.tsx:58-67
const filtered = entries.filter((e) => {
  if (!search) return true
  const q = search.toLowerCase()
  return (
    e.title.toLowerCase().includes(q) ||
    e.content.toLowerCase().includes(q) ||
    e.tags.some((t) => t.toLowerCase().includes(q)) ||
    (e.summary?.toLowerCase().includes(q) ?? false)
  )
})

// src/components/index/IndexView.tsx:134
onChange={(e) => setSearch(e.target.value)}
```

Every character change triggers a full re-render with full-array filtering.

## Desired Behaviour

- User types freely without lag
- Filtering runs after the user stops typing for 300ms
- The input remains responsive (controlled component, no visual delay)
- No new dependencies — use a simple `useRef`/`setTimeout` pattern or a tiny custom hook

## Implementation Steps

1. **Add a debounced search state pattern** to `src/components/index/IndexView.tsx`:

   ```typescript
   const [search, setSearch] = useState('')          // instant (drives input value)
   const [debouncedSearch, setDebouncedSearch] = useState('')  // delayed (drives filtering)
   
   useEffect(() => {
     const timer = setTimeout(() => setDebouncedSearch(search), 300)
     return () => clearTimeout(timer)
   }, [search])
   ```

2. **Update the filter to use `debouncedSearch`**:

   ```typescript
   const filtered = entries.filter((e) => {
     if (!debouncedSearch) return true
     const q = debouncedSearch.toLowerCase()
     return (
       e.title.toLowerCase().includes(q) ||
       e.content.toLowerCase().includes(q) ||
       e.tags.some((t) => t.toLowerCase().includes(q)) ||
       (e.summary?.toLowerCase().includes(q) ?? false)
     )
   })
   ```

3. **Wrap the filter in `useMemo`** for additional safety:

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

4. **Keep the input `onChange` unchanged** — it still writes to `search` for instant visual feedback.

## Files to Modify

- **Modify**: `src/components/index/IndexView.tsx`
  - Add `useMemo` to the React import (line 1)
  - Add `debouncedSearch` state and `useEffect` timer
  - Replace the `filtered` computation with `useMemo` using `debouncedSearch`

## Dependencies

None.

## Testing Notes

- Type quickly in the search box — the input should feel instant
- Results should update ~300ms after you stop typing
- Clearing the search box should immediately show all entries
- Verify filtering still matches on title, content, tags, and summary
- Test with empty entries list — should show empty state, not crash

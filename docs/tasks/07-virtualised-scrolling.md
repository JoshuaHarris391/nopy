# 07 — Virtualised Scrolling for Entry Index Table

## Problem

The IndexView renders every journal entry as a table row in the DOM simultaneously. At 1,825 entries, this means ~5,000+ DOM nodes (each row has 5-6 cells plus tag elements). Initial render takes 200-400ms and scroll performance can degrade, especially on lower-powered devices.

## Current Behaviour

`src/components/index/IndexView.tsx:155-239`:
```typescript
{filtered.map((entry) => {
  const isExpanded = expandedId === entry.id
  return (
    <tbody key={entry.id}>
      <tr onClick={() => navigate(`/journal/${entry.id}`)} ...>
        {/* 5-6 cells per row */}
      </tr>
      <tr className="lg:hidden">
        {/* Expandable detail row */}
      </tr>
    </tbody>
  )
})}
```

Every entry in `filtered` renders immediately — no windowing or lazy rendering.

## Desired Behaviour

- Only the visible rows (~20-30) are rendered in the DOM at any time
- Scrolling is smooth with no layout jumps
- The existing table structure, styling, click handlers, and expandable rows are preserved
- Search filtering still works (virtualise the filtered list, not the full list)

## Implementation Steps

### 1. Install `@tanstack/react-virtual`

```bash
npm install @tanstack/react-virtual
```

### 2. Refactor the table to use virtualisation

The key challenge is that `@tanstack/react-virtual` works best with `div`-based layouts rather than `<table>`. The recommended approach for table virtualisation:

**Option A (Recommended): Convert to div-based layout with CSS Grid**

Replace the `<table>` with a scrollable container of row divs. This is cleaner for virtualisation and gives more layout control:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

// Inside IndexView component:
const parentRef = useRef<HTMLDivElement>(null)

const virtualizer = useVirtualizer({
  count: filtered.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 52, // estimated row height in px
  overscan: 10,
})

// Render:
<div ref={parentRef} className="flex-1 overflow-y-auto" style={{ padding: '36px 44px' }}>
  {/* Search bar (stays outside virtualised area) */}
  {/* ... existing search input ... */}
  
  {/* Header row */}
  <div className="grid" style={{ gridTemplateColumns: '100px 1fr 60px 200px 1fr 40px', ... }}>
    <div>Date</div>
    <div>Title</div>
    <div>Mood</div>
    <div>Tags</div>
    <div>Summary</div>
  </div>
  
  {/* Virtualised rows */}
  <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
    {virtualizer.getVirtualItems().map((virtualRow) => {
      const entry = filtered[virtualRow.index]
      return (
        <div
          key={entry.id}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualRow.start}px)`,
          }}
          onClick={() => navigate(`/journal/${entry.id}`)}
        >
          {/* Same cell content as current table rows */}
        </div>
      )
    })}
  </div>
</div>
```

**Option B: Keep `<table>` with manual windowing**

If preserving the exact `<table>` structure is important, use a spacer `<tr>` approach:

```typescript
const virtualizer = useVirtualizer({
  count: filtered.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 52,
  overscan: 10,
})

<table>
  <thead>...</thead>
  <tbody>
    {/* Top spacer */}
    <tr style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0 }} />
    
    {virtualizer.getVirtualItems().map((virtualRow) => {
      const entry = filtered[virtualRow.index]
      return <tr key={entry.id}>...</tr>
    })}
    
    {/* Bottom spacer */}
    <tr style={{ height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0) }} />
  </tbody>
</table>
```

### 3. Handle the expandable row

The current design has a second `<tr>` per entry for mobile expandable details. With virtualisation:
- Track `expandedId` as before
- When a row is expanded, adjust its `estimateSize` to account for the detail content
- Call `virtualizer.measureElement` on the expanded row to update the virtualiser

### 4. Preserve scroll position on search

When `debouncedSearch` (from task 03) changes, the virtualiser should scroll to top:
```typescript
useEffect(() => {
  virtualizer.scrollToIndex(0)
}, [debouncedSearch])
```

## Files to Modify

- **Modify**: `src/components/index/IndexView.tsx` — replace the `filtered.map()` table rendering with virtualised rendering
- **Modify**: `package.json` — add `@tanstack/react-virtual`

## Dependencies

- `@tanstack/react-virtual` (npm package)

## Testing Notes

- Load with 50+ entries. Open DevTools → Elements. Verify only ~20-30 row elements exist in the DOM regardless of entry count.
- Scroll quickly — rows should render smoothly with no blank areas (overscan handles this).
- Click a row — should still navigate to the journal entry.
- Expand a row on mobile — detail content should appear without layout jumps.
- Search/filter — virtualised list should update, scroll to top.
- Resize the window — rows should adapt (responsive column hiding should still work).
- Test with 0 entries and 1 entry — should not crash.

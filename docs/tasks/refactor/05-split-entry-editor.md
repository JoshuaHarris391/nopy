# 05 — Split EntryEditor into Hooks and Sub-Components

## Problem

`src/components/journal/EntryEditor.tsx` is 501 lines doing seven jobs: autosave debouncing, keyboard shortcuts, textarea auto-resize, cursor-scroll management, mood selection, delete confirmation, and typography controls. Modifying any single concern requires reading through the entire file and mentally filtering out the other six. Adding a feature (e.g. undo, word count) means the file grows further.

## Current Behaviour

Line-range map of responsibilities:

| Lines | Concern |
|---|---|
| 18-24 | Mood helpers (addressed in task 04) |
| 26-100 | Inline `MoodBar` component (addressed in task 04) |
| 102-141 | Initialization, entry hydration, refs |
| 143-157 | Keyboard shortcut — Cmd+S (addressed in task 02) |
| 159-200 | `ensureEntry` + `handleSave` |
| 202-211 | Autosave debounce effect |
| 213-218 | Delete handler |
| 234-244 | Textarea auto-resize effect |
| 278-296 | Delete button (icon) |
| 344-361 | `onChange` with inline resize logic (duplicated from L234-244) |
| 380-444 | Typography toolbar (font-size +/-, delete) |
| 449-498 | Delete confirmation modal (duplicated in SettingsView — addressed in task 07) |

The two most concerning patterns:

1. **Duplicated auto-resize logic** — the `useEffect` at L234-244 and the imperative resize inside `onChange` at L344-361 both calculate `scrollHeight` and set `style.height` on the textarea. Two code paths doing the same thing.
2. **The autosave `useEffect` at L202-211** depends on `[dirty, title, content, moodValue, handleSave]`. Since `handleSave` recreates whenever its own deps change (L200), the effect tears down and rebuilds the 1500ms timer on every keystroke. It works (cleanup clears the prior timer) but the dependency churn is wasteful.

## Desired Behaviour

- `EntryEditor.tsx` shrinks to ~150 lines of layout and state wiring.
- Each extracted concern is independently testable.
- No duplicated resize logic.

Target file tree after extraction:

```
src/hooks/
  useAutosave.ts           ← debounce + dirty flag + save orchestration
  useAutoResizeTextarea.ts ← textarea height management
  useKeyboardShortcut.ts   ← (already created in task 02)
src/components/journal/
  EntryEditor.tsx          ← layout + wiring only (~150 lines)
  EditorToolbar.tsx        ← font-size controls
src/components/ui/
  MoodBar.tsx              ← (already created in task 04)
  ConfirmDialog.tsx        ← (already created in task 07)
```

## Implementation Steps

### 1. Extract `useAutosave`

Create `src/hooks/useAutosave.ts`:

```typescript
import { useEffect, useRef, useCallback } from 'react'

export function useAutosave(
  save: () => Promise<void>,
  deps: unknown[],
  delay: number = 1500,
): { dirty: boolean; markDirty: () => void; markClean: () => void } {
  const [dirty, setDirty] = useState(false)
  const saveRef = useRef(save)
  saveRef.current = save
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!dirty) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => saveRef.current(), delay)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [dirty, delay, ...deps])

  return {
    dirty,
    markDirty: useCallback(() => setDirty(true), []),
    markClean: useCallback(() => setDirty(false), []),
  }
}
```

This replaces `EntryEditor.tsx:143-144` (the `autosaveTimerRef`) and `L202-211` (the debounce effect). The `useKeyboardShortcut` hook from task 02 handles the immediate Cmd+S save separately.

### 2. Extract `useAutoResizeTextarea`

Create `src/hooks/useAutoResizeTextarea.ts`:

```typescript
import { useEffect, useCallback, type RefObject } from 'react'

export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  content: string,
  fontSize: number,
): { resize: () => void } {
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [ref])

  useEffect(() => { resize() }, [content, fontSize, resize])

  return { resize }
}
```

This replaces both `EntryEditor.tsx:234-244` and the duplicated resize logic inside `onChange` at L344-361.

### 3. Extract `EditorToolbar`

Create `src/components/journal/EditorToolbar.tsx`:

```typescript
interface EditorToolbarProps {
  fontSize: number
  onFontSizeChange: (size: number) => void
  onDelete: () => void
  canDelete: boolean
}
```

Move the `+`/`-` font-size controls and the delete icon button from `EntryEditor.tsx:380-444`. The toolbar is a thin presentational component.

### 4. Wire everything together in `EntryEditor`

The editor becomes:

```typescript
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'
import { useAutosave } from '../../hooks/useAutosave'
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea'
import { MoodBar } from '../ui/MoodBar'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EditorToolbar } from './EditorToolbar'

export default function EntryEditor() {
  // state: title, content, moodValue, fontSize, saving, justSaved, showDeleteModal
  // store: per-field selectors (task 10)
  // hooks: useKeyboardShortcut, useAutosave, useAutoResizeTextarea
  // render: textarea + MoodBar + EditorToolbar + ConfirmDialog
}
```

### 5. Replace full store destructure with selectors

Change `EntryEditor.tsx:105` from `const { entries, ... } = useJournalStore()` to per-field selectors. This is coordinated with task 10 but can be done here as part of the split.

## Files to Modify

- **New**: `src/hooks/useAutosave.ts`
- **New**: `src/hooks/useAutoResizeTextarea.ts`
- **New**: `src/components/journal/EditorToolbar.tsx`
- **New**: `src/__tests__/hooks/useAutosave.test.ts`
- **New**: `src/__tests__/hooks/useAutoResizeTextarea.test.ts`
- **Modify**: `src/components/journal/EntryEditor.tsx` — remove extracted code, import new hooks and components.

## Dependencies

- **02** — `useKeyboardShortcut` must exist.
- **04** — `MoodBar` must be extracted to `ui/`.
- **07** — `ConfirmDialog` must be extracted to `ui/`.
- **13** — test infrastructure for `renderHook`.

## Testing Notes

### Unit

`src/__tests__/hooks/useAutosave.test.ts`:

```ts
describe('useAutosave', () => {
  it('calls save after the delay when markDirty is called', () => {
    /**
     * The autosave hook debounces the save function by a configurable delay.
     * This test verifies the basic contract: marking dirty triggers a save
     * after the delay elapses. Uses vi.useFakeTimers to control time.
     * Input: markDirty() then advance timers by 1500ms
     * Expected output: save called exactly once
     */
  })

  it('resets the timer when deps change before the delay elapses', () => {
    /**
     * When the user continues typing (changing content), the debounce timer
     * must restart. Otherwise the save would fire mid-word. This test
     * changes a dep at 1000ms (before the 1500ms delay) and confirms the
     * timer resets.
     * Input: markDirty, advance 1000ms, rerender with new dep, advance 1500ms
     * Expected output: save called once (not twice)
     */
  })

  it('does not call save when markClean is called before the delay', () => {
    /**
     * An explicit save (Cmd+S) calls markClean, which should cancel the
     * pending debounce so the entry is not saved twice.
     * Input: markDirty, then markClean at 500ms, then advance to 2000ms
     * Expected output: save never called
     */
  })
})
```

### Manual

1. Open an entry, start typing. After 1.5 seconds of inactivity, the "Saved" flash should appear.
2. Press Cmd+S mid-typing. The save should fire immediately.
3. Delete an entry via the toolbar trash icon. The `ConfirmDialog` should appear.
4. Open React DevTools profiler. Type rapidly. The editor should not re-mount internal components per keystroke.

# 02 — Fix EntryEditor Keydown Effect and Extract `useKeyboardShortcut`

## Problem

The Cmd/Ctrl+S keyboard shortcut in `EntryEditor.tsx` is registered inside a `useEffect` with **no dependency array**. React runs the effect after every render, so the listener is removed and re-added on every keystroke, mood change, dirty flag flip, and parent re-render. It works by accident — each render produces a fresh closure over the current `handleSave` — but it burns a small amount of work on every render and obscures a dependency bug waiting to happen.

Extracting the pattern into a reusable `useKeyboardShortcut` hook fixes the churn and makes the same primitive available for any future shortcuts (the existing codebase has no other keyboard shortcuts yet, but the Settings and Profile views both have obvious candidates).

## Current Behaviour

### `EntryEditor.tsx:143-157` — missing dep array

```typescript
// Autosave with debounce
const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

// Keyboard shortcut: Cmd+S / Ctrl+S
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
      handleSave()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
})   // <-- no dependency array; runs after every render
```

`handleSave` is declared below as a `useCallback` at `EntryEditor.tsx:183-200` with dependencies `[saving, ensureEntry, updateEntry, title, content, moodValue]`. Every keystroke changes `content`, which creates a new `handleSave`, which triggers a new render — and the dep-less effect tears down and rebuilds the listener each time.

## Desired Behaviour

- The keydown listener is attached once per mount and detached on unmount.
- The listener always calls the latest `handleSave` without re-registering.
- The shortcut logic lives in a reusable hook, not inline in `EntryEditor`.
- The hook accepts a shortcut descriptor (e.g. `'mod+s'`) and a handler callback.

## Implementation Steps

### 1. Create `src/hooks/` directory

```
src/hooks/
  useKeyboardShortcut.ts
```

The directory does not exist yet. This task creates it; subsequent refactor tasks (05, 06, 11) will add more hooks to it.

### 2. Write `useKeyboardShortcut`

The hook uses a ref to hold the latest handler so registration only happens on mount:

```typescript
import { useEffect, useRef } from 'react'

type Shortcut = 'mod+s' | 'mod+enter' | 'escape'

function matches(e: KeyboardEvent, shortcut: Shortcut): boolean {
  switch (shortcut) {
    case 'mod+s':     return (e.metaKey || e.ctrlKey) && e.key === 's'
    case 'mod+enter': return (e.metaKey || e.ctrlKey) && e.key === 'Enter'
    case 'escape':    return e.key === 'Escape'
  }
}

export function useKeyboardShortcut(shortcut: Shortcut, handler: () => void): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (matches(e, shortcut)) {
        e.preventDefault()
        handlerRef.current()
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [shortcut])
}
```

The ref pattern is intentional: `handler` can change freely (and will, every time `title`/`content` changes) without triggering listener re-registration.

### 3. Replace the inline effect in `EntryEditor`

Delete `EntryEditor.tsx:147-157` and replace with:

```typescript
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'

// ...inside EntryEditor...
useKeyboardShortcut('mod+s', () => {
  if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
  handleSave()
})
```

## Files to Modify

- **New**: `src/hooks/useKeyboardShortcut.ts`
- **New**: `src/__tests__/hooks/useKeyboardShortcut.test.ts`
- **Modify**: `src/components/journal/EntryEditor.tsx` — remove L147-157, add the `useKeyboardShortcut` call.

## Dependencies

Requires `13 — Test infrastructure` for the `renderHook` + jsdom environment.

## Testing Notes

### Unit

Create `src/__tests__/hooks/useKeyboardShortcut.test.ts` following the docstring convention:

```ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'

describe('useKeyboardShortcut', () => {
  it('calls the handler when the matching key combination is pressed', () => {
    /**
     * The hook exists to give components a declarative way to bind keyboard
     * shortcuts without manually wiring addEventListener/removeEventListener.
     * This test verifies the core contract: pressing the shortcut triggers
     * the handler.
     * Input: renderHook(useKeyboardShortcut('mod+s', handler)), then dispatch
     *   a synthetic KeyboardEvent with metaKey=true and key='s'
     * Expected output: handler called exactly once
     */
    // ...
  })

  it('does not re-register the listener when the handler changes', () => {
    /**
     * A common bug in keyboard-shortcut hooks is re-running useEffect whenever
     * the handler identity changes, which churns addEventListener on every
     * render. This hook uses a ref to hold the latest handler so the effect
     * runs exactly once per mount. This test spies on addEventListener to
     * verify the listener is attached exactly once across re-renders.
     * Input: renderHook with a handler that changes identity on rerender
     * Expected output: window.addEventListener called exactly once
     */
    // ...
  })

  it('always calls the latest handler, not the one at mount time', () => {
    /**
     * Because the hook caches the handler in a ref, re-renders must update
     * the ref so the listener always invokes the current handler. This test
     * verifies that a handler swapped between mount and key-press actually
     * receives the event.
     * Input: mount with handler A, rerender with handler B, press the key
     * Expected output: handler B called, handler A not called
     */
    // ...
  })

  it('removes the listener on unmount', () => {
    /**
     * Forgetting removeEventListener leaks handlers and causes dead components
     * to respond to key presses. This test verifies the cleanup function runs.
     * Input: renderHook then unmount, dispatch the key event afterwards
     * Expected output: handler not called after unmount
     */
    // ...
  })
})
```

### Manual

1. Open the editor and start typing.
2. Press Cmd+S (or Ctrl+S on Linux/Windows).
3. **Expected:** the "Saving…" → "Saved" flash fires immediately, bypassing the 1500ms debounce.
4. Open React DevTools profiler, record a typing session.
5. **Expected:** no `addEventListener` calls per keystroke (sanity check: the profiler should not show the editor re-mounting anything).

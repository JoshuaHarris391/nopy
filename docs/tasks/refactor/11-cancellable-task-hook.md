# 11 — Extract `useCancellableTask` Hook and `CancellableActionButton`

## Problem

The "abort ref + processing/progress/result + hover-flip Processing…/Stop button" pattern is reproduced verbatim in at least three view components:

| Location | Lines (approx) |
|---|---|
| `IndexView.tsx` | L17-52 (state + handler), L83-90 (hover button) |
| `ProfileView.tsx` | L18-71 (state + handler), L101-108 (hover button) |
| `SettingsView.tsx` | handleForceUpdate handler + L375-382 (hover button) |

Each copy declares `processing`, `progress`, `result`, and an `AbortController` ref, wires them to an async task, and renders a button that shows "Processing…" normally and "Stop" on hover. The three copies are nearly identical — only the task function and result message differ.

Additionally, `journalStore.startForceUpdate` (`journalStore.ts:171-196`) implements the same pattern at the store level (its own `forceProcessing`, `forceProgress`, `forceResult`, `forceAbortController`).

## Current Behaviour

### One of the three component copies (IndexView, approximate)

```typescript
const [processing, setProcessing] = useState(false)
const [progress, setProgress] = useState({ current: 0, total: 0, title: '' })
const [result, setResult] = useState<string | null>(null)
const abortRef = useRef<AbortController | null>(null)

const handleProcess = async () => {
  if (processing) { abortRef.current?.abort(); return }
  const controller = new AbortController()
  abortRef.current = controller
  setProcessing(true)
  setResult(null)
  try {
    const count = await processEntries(apiKey, false, (c, t, title) => {
      setProgress({ current: c, total: t, title })
    }, controller.signal)
    if (!controller.signal.aborted) {
      setResult(`Done — ${count} entries processed`)
      setTimeout(() => setResult(null), 3000)
    }
  } catch (e) { /* abort vs real error handling */ }
  finally { setProcessing(false) }
}
```

### The hover-flip button (identical in all three)

```typescript
<span
  onMouseEnter={() => setHover(true)}
  onMouseLeave={() => setHover(false)}
  onClick={handleProcess}
>
  {hover ? 'Stop' : `Processing ${progress.current}/${progress.total}...`}
</span>
```

## Desired Behaviour

- One `useCancellableTask` hook that encapsulates the state machine (idle → running → done/error), abort controller, and progress tracking.
- One `CancellableActionButton` UI component that renders the hover-flip button.
- All three component copies replaced.
- The store-level equivalent (`journalStore.startForceUpdate`) simplified to delegate to the hook's pattern, or left as-is if the component-level hook fully replaces its usage.

## Implementation Steps

### 1. Create `src/hooks/useCancellableTask.ts`

```typescript
import { useState, useRef, useCallback } from 'react'

export type TaskState = 'idle' | 'running' | 'done' | 'error'

export interface CancellableTaskResult<T> {
  state: TaskState
  progress: { current: number; total: number; title: string }
  result: T | null
  error: string | null
  run: (task: (onProgress: (c: number, t: number, title: string) => void, signal: AbortSignal) => Promise<T>) => Promise<void>
  abort: () => void
}

export function useCancellableTask<T = string>(resultTimeout = 3000): CancellableTaskResult<T> {
  const [state, setState] = useState<TaskState>('idle')
  const [progress, setProgress] = useState({ current: 0, total: 0, title: '' })
  const [result, setResult] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  const run = useCallback(async (
    task: (onProgress: (c: number, t: number, title: string) => void, signal: AbortSignal) => Promise<T>,
  ) => {
    if (controllerRef.current) { abort(); return }
    const controller = new AbortController()
    controllerRef.current = controller
    setState('running')
    setResult(null)
    setError(null)
    setProgress({ current: 0, total: 0, title: '' })
    try {
      const value = await task(
        (c, t, title) => setProgress({ current: c, total: t, title }),
        controller.signal,
      )
      if (!controller.signal.aborted) {
        setState('done')
        setResult(value)
        setTimeout(() => { setState('idle'); setResult(null) }, resultTimeout)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setState('idle')
      } else {
        setState('error')
        setError(e instanceof Error ? e.message : String(e))
        setTimeout(() => { setState('idle'); setError(null) }, resultTimeout)
      }
    } finally {
      controllerRef.current = null
    }
  }, [abort, resultTimeout])

  return { state, progress, result, error, run, abort }
}
```

### 2. Create `src/components/ui/CancellableActionButton.tsx`

```typescript
interface CancellableActionButtonProps {
  state: TaskState
  progress: { current: number; total: number; title: string }
  result: string | null
  error: string | null
  idleLabel: string
  onRun: () => void
  onAbort: () => void
}
```

Renders the hover-flip button: idle → `idleLabel`, running → "Processing X/Y… (hover: Stop)", done → result text, error → error text. Uses pure CSS `:hover` instead of local hover state (per task 14 cleanup note) to avoid unnecessary re-renders.

### 3. Replace all three component copies

In each view, replace the ~40 lines of boilerplate with:

```typescript
const task = useCancellableTask<string>()

const handleProcess = () => task.run(async (onProgress, signal) => {
  const count = await processEntries(apiKey, false, onProgress, signal)
  return `Done — ${count} entries processed`
})

// In JSX:
<CancellableActionButton
  state={task.state}
  progress={task.progress}
  result={task.result}
  error={task.error}
  idleLabel="Update Index"
  onRun={handleProcess}
  onAbort={task.abort}
/>
```

### 4. Simplify or remove `journalStore.startForceUpdate`

If the component-level hook fully replaces the need for store-level state (`forceProcessing`, `forceProgress`, `forceResult`, `forceAbortController`), remove those fields from `journalStore` to reduce store surface area. If multiple components need to observe the same task's progress, keep the store version — but it should delegate to `processEntries` directly without reimplementing the state machine.

## Files to Modify

- **New**: `src/hooks/useCancellableTask.ts`
- **New**: `src/components/ui/CancellableActionButton.tsx`
- **New**: `src/__tests__/hooks/useCancellableTask.test.ts`
- **Modify**: `src/components/index/IndexView.tsx` — replace boilerplate.
- **Modify**: `src/components/profile/ProfileView.tsx` — replace boilerplate.
- **Modify**: `src/components/settings/SettingsView.tsx` — replace boilerplate.
- **Possibly modify**: `src/stores/journalStore.ts` — remove `forceProcessing`/`forceProgress`/`forceResult`/`forceAbortController` if fully replaced.

## Dependencies

- **13** — test infrastructure for `renderHook`.

## Testing Notes

### Unit

`src/__tests__/hooks/useCancellableTask.test.ts`:

```ts
describe('useCancellableTask', () => {
  it('transitions from idle to running to done on a successful task', async () => {
    /**
     * The hook manages a mini state machine for async tasks with cancellation.
     * This test verifies the happy path: calling run() moves to 'running',
     * the task resolves, and state becomes 'done' with the result.
     * Input: run(async () => 'finished')
     * Expected output: state transitions idle → running → done, result === 'finished'
     */
  })

  it('fires the AbortSignal and returns to idle when abort is called', async () => {
    /**
     * Users can cancel long-running indexing jobs. This test verifies that
     * calling abort() triggers the AbortSignal, which the task is expected
     * to respect. The state should return to 'idle' (not 'error') because
     * cancellation is intentional.
     * Input: run a task that awaits indefinitely, call abort()
     * Expected output: signal.aborted === true, state === 'idle'
     */
  })

  it('reports progress updates from the task', async () => {
    /**
     * The progress callback updates { current, total, title } so the UI
     * can render a progress bar. This test verifies the state reflects
     * the latest progress call.
     * Input: run(async (onProgress) => { onProgress(3, 10, 'entry-3') })
     * Expected output: progress === { current: 3, total: 10, title: 'entry-3' }
     */
  })

  it('transitions to error state on a non-abort exception', async () => {
    /**
     * If the task throws a real error (not an AbortError), the hook must
     * surface it so the UI can display a message. This distinguishes
     * user-initiated cancellation from unexpected failures.
     * Input: run(async () => { throw new Error('API down') })
     * Expected output: state === 'error', error === 'API down'
     */
  })
})
```

### Manual

1. Open the Index view. Click "Update Index". The button should show progress.
2. Hover the button mid-processing. It should show "Stop".
3. Click to abort. The button should return to "Update Index".
4. Repeat in Profile view ("Generate Profile") and Settings ("Force Reprocess").

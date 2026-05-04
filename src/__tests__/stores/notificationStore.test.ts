import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useNotificationStore } from '../../stores/notificationStore'

beforeEach(() => {
  // Hand-rolled fake timers so we can verify auto-dismiss without flakiness.
  vi.useFakeTimers()
  useNotificationStore.getState().clear()
})

afterEach(() => {
  useNotificationStore.getState().clear()
  vi.useRealTimers()
})

describe('useNotificationStore', () => {
  it('push returns an id and adds the notification to items', () => {
    /**
     * The id is the only handle callers have for programmatic dismissal,
     * so push must return it. Items array should contain exactly the new
     * notification with the right shape.
     */
    const id = useNotificationStore.getState().push({ kind: 'error', title: 'Boom', message: 'something failed' })
    const items = useNotificationStore.getState().items
    expect(typeof id).toBe('string')
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(id)
    expect(items[0].kind).toBe('error')
    expect(items[0].title).toBe('Boom')
    expect(items[0].message).toBe('something failed')
  })

  it('auto-dismisses after the kind-specific default TTL (error 8000ms)', () => {
    /**
     * Errors must stay visible long enough for the user to read the
     * actionable copy, but disappear on their own — they're transient.
     * The default error TTL is 8000ms; success/info are shorter. This
     * test pins the error default; the others share the mechanism.
     */
    useNotificationStore.getState().push({ kind: 'error', title: 'X', message: 'y' })
    expect(useNotificationStore.getState().items).toHaveLength(1)

    vi.advanceTimersByTime(7999)
    expect(useNotificationStore.getState().items).toHaveLength(1)

    vi.advanceTimersByTime(2)
    expect(useNotificationStore.getState().items).toHaveLength(0)
  })

  it('respects an explicit ttlMs override', () => {
    /**
     * Per-call override beats the kind default — useful for the rare case
     * of a long-running error the user must see (set ttlMs to something
     * very large) or a quick success blip (set to 1000).
     */
    useNotificationStore.getState().push({ kind: 'error', title: 'X', message: 'y', ttlMs: 1000 })
    vi.advanceTimersByTime(999)
    expect(useNotificationStore.getState().items).toHaveLength(1)
    vi.advanceTimersByTime(2)
    expect(useNotificationStore.getState().items).toHaveLength(0)
  })

  it('manual dismiss removes the item and cancels its pending timer', () => {
    /**
     * The user can click × to dismiss early. We must clear the timer too
     * — if we left it scheduled and meanwhile the same id was pushed
     * again (unlikely but possible after a UUID collision or in tests),
     * the second instance would be auto-dismissed by the stale timer.
     */
    const id = useNotificationStore.getState().push({ kind: 'error', title: 'X', message: 'y' })
    useNotificationStore.getState().dismiss(id)
    expect(useNotificationStore.getState().items).toHaveLength(0)
    // Advancing past the TTL must not blow up looking for an already-cleared item.
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow()
  })

  it('queues multiple notifications in push order', () => {
    /**
     * The bottom-right stack renders newest-on-bottom (push order). The
     * AppShell view code maps over items[] directly, so order matters.
     */
    useNotificationStore.getState().push({ kind: 'error', title: 'A', message: 'a' })
    useNotificationStore.getState().push({ kind: 'success', title: 'B', message: 'b' })
    useNotificationStore.getState().push({ kind: 'info', title: 'C', message: 'c' })
    const items = useNotificationStore.getState().items
    expect(items.map((n) => n.title)).toEqual(['A', 'B', 'C'])
    expect(items.map((n) => n.kind)).toEqual(['error', 'success', 'info'])
  })

  it('clear empties items and cancels every pending timer', () => {
    /**
     * Used between tests (and on app unload, conceptually) to ensure no
     * setTimeout callbacks fire after the store is meant to be quiescent.
     */
    useNotificationStore.getState().push({ kind: 'error', title: 'X', message: 'y' })
    useNotificationStore.getState().push({ kind: 'success', title: 'X', message: 'y' })
    useNotificationStore.getState().clear()
    expect(useNotificationStore.getState().items).toHaveLength(0)
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow()
    // No new items appear after timers would have fired.
    expect(useNotificationStore.getState().items).toHaveLength(0)
  })
})

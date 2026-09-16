import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePageSwipe } from '../../hooks/usePageSwipe'

/**
 * A two-finger trackpad swipe reaches the page as a burst of `wheel` events
 * with pixel deltas (deltaMode 0). These helpers replay such bursts on a host
 * element the hook is attached to.
 */
function setup() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const onNext = vi.fn()
  const onPrev = vi.fn()
  renderHook(() => usePageSwipe({ current: host }, { onNext, onPrev }))
  const wheel = (deltaX: number, deltaY = 0, deltaMode = 0) =>
    host.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY, deltaMode, bubbles: true }))
  return { host, onNext, onPrev, wheel }
}

describe('usePageSwipe: two-finger swipe turns the page once per gesture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    // Let the gesture tracker's idle timer run so the next test starts clean.
    vi.advanceTimersByTime(500)
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('swiping left fires next once, ignores momentum, then accepts a new gesture', () => {
    /**
     * A real swipe is a ramp of small deltas followed by a long momentum tail
     * after the fingers lift. The page must turn exactly once per gesture:
     * fire when the accumulated distance crosses the threshold, swallow the
     * tail, and only listen again after 200ms of silence.
     *
     * Input: three events of +50px, then more +50px events with no pause,
     * then 250ms of silence, then another +150px burst.
     * Expected: onNext called once after the first burst, still once after
     * the tail, twice after the second gesture.
     */
    const { onNext, onPrev, wheel } = setup()

    wheel(50)
    wheel(50)
    expect(onNext).not.toHaveBeenCalled()
    wheel(50)
    expect(onNext).toHaveBeenCalledTimes(1)

    wheel(50)
    wheel(50)
    expect(onNext).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(250)
    wheel(80)
    wheel(80)
    expect(onNext).toHaveBeenCalledTimes(2)
    expect(onPrev).not.toHaveBeenCalled()
  })

  it('swiping right turns back', () => {
    /**
     * Fingers moving right push the content right (negative deltaX), which
     * turns back to the previous page.
     *
     * Input: one -150px event.
     * Expected: onPrev called once, onNext never.
     */
    const { onNext, onPrev, wheel } = setup()
    wheel(-150)
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).not.toHaveBeenCalled()
  })

  it('leaves vertical scrolling and mouse wheels alone', () => {
    /**
     * Scrolling the entry text is vertical; it often carries a little sideways
     * drift that must never turn the page. The axis is locked on the first
     * significant event of a gesture, so a mostly-vertical gesture ignores
     * all sideways drift until it ends. Mouse wheels report lines, not pixels,
     * and are ignored outright.
     *
     * Input: a vertical gesture with sideways drift totalling 200px; after a
     * pause, a line-mode event of +300.
     * Expected: neither callback fires.
     */
    const { onNext, onPrev, wheel } = setup()
    wheel(30, 80)
    wheel(70, 10)
    wheel(100, 5)
    expect(onNext).not.toHaveBeenCalled()

    vi.advanceTimersByTime(250)
    wheel(300, 0, 1)
    expect(onNext).not.toHaveBeenCalled()
    expect(onPrev).not.toHaveBeenCalled()
  })
})

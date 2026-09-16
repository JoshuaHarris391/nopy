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
  const onCommit = vi.fn()
  const onProgress = vi.fn()
  const onCancel = vi.fn()
  const { rerender } = renderHook(
    ({ locked }: { locked: boolean }) => usePageSwipe({ current: host }, { onCommit, onProgress, onCancel, locked }),
    { initialProps: { locked: false } },
  )
  const wheel = (deltaX: number, deltaY = 0, deltaMode = 0) =>
    host.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY, deltaMode, bubbles: true }))
  return { host, onCommit, onProgress, onCancel, wheel, setLocked: (locked: boolean) => rerender({ locked }) }
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

  it('reports progress, commits next once, ignores momentum, then accepts a new gesture', () => {
    /**
     * A real swipe is a ramp of small deltas followed by a long momentum tail
     * after the fingers lift. The page follows the fingers via progress
     * callbacks, turns exactly once when the accumulated distance crosses the
     * threshold, swallows the tail, and only listens again after 200ms of
     * silence.
     *
     * Input: three events of +50px, then more +50px events with no pause,
     * then 400ms of silence, then another +160px burst.
     * Expected: progress reported at 50 and 100; onCommit('next') once after
     * the first burst, still once after the tail, twice after the second.
     */
    const { onCommit, onProgress, wheel } = setup()

    wheel(50)
    wheel(50)
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([50, 100])
    expect(onCommit).not.toHaveBeenCalled()
    wheel(50)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenLastCalledWith('next')

    wheel(50)
    wheel(50)
    expect(onCommit).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(400)
    wheel(80)
    wheel(80)
    expect(onCommit).toHaveBeenCalledTimes(2)
  })

  it('a turn in progress spends the swipe rather than starting the next one', () => {
    /**
     * The glide to the next card takes about half a second, during which the
     * trackpad is still streaming the momentum tail of the swipe that caused
     * it. If the tracker forgot the gesture during the glide, that tail would
     * read as a fresh swipe and the pages would run on card after card. While
     * locked, events keep the gesture alive but can never fire; a new swipe
     * is accepted only after the lock lifts and the trackpad goes quiet.
     *
     * Input: commit a turn; lock; a stream of +60px events every 100ms for
     * 600ms; unlock; more +60px events with no pause; then 400ms of silence
     * and a fresh +200px burst.
     * Expected: onCommit called once until the silence, then twice.
     */
    const { onCommit, wheel, setLocked } = setup()
    wheel(200)
    expect(onCommit).toHaveBeenCalledTimes(1)

    setLocked(true)
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(100)
      wheel(60)
    }
    setLocked(false)
    wheel(60)
    wheel(60)
    wheel(60)
    expect(onCommit).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(400)
    wheel(200)
    expect(onCommit).toHaveBeenCalledTimes(2)
  })

  it('swiping right turns back', () => {
    /**
     * Fingers moving right push the content right (negative deltaX), which
     * turns back to the previous page.
     *
     * Input: one -150px event.
     * Expected: onCommit('prev') once.
     */
    const { onCommit, wheel } = setup()
    wheel(-150)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('prev')
  })

  it('cancels a gesture released before the threshold so the page can settle back', () => {
    /**
     * A tentative nudge that stops short must not turn the page, and the
     * carousel needs to know the fingers are gone so it can glide the page
     * back to centre.
     *
     * Input: +40px then +30px, then 200ms of silence.
     * Expected: no commit; onCancel called once after the silence.
     */
    const { onCommit, onCancel, wheel } = setup()
    wheel(40)
    wheel(30)
    expect(onCancel).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('leaves vertical scrolling and mouse wheels alone', () => {
    /**
     * Scrolling the entry text is vertical; it often carries a little sideways
     * drift that must never move the page. The axis is locked on the first
     * significant event of a gesture, so a mostly-vertical gesture ignores
     * all sideways drift until it ends. Mouse wheels report lines, not pixels,
     * and are ignored outright.
     *
     * Input: a vertical gesture with sideways drift totalling 200px; after a
     * pause, a line-mode event of +300.
     * Expected: no progress, no commit, no cancel.
     */
    const { onCommit, onProgress, onCancel, wheel } = setup()
    wheel(30, 80)
    wheel(70, 10)
    wheel(100, 5)
    vi.advanceTimersByTime(250)
    wheel(300, 0, 1)
    vi.advanceTimersByTime(250)

    expect(onProgress).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })
})

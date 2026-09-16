import { useEffect, useRef, type RefObject } from 'react'

export type FlipDirection = 'next' | 'prev'

export interface PageSwipeOptions {
  /** Live horizontal distance (px) since the gesture began. Positive = fingers moving left. */
  onProgress?: (dx: number) => void
  /** The gesture crossed the threshold: turn the page. Fires once per gesture. */
  onCommit: (dir: FlipDirection) => void
  /** The gesture ended without crossing the threshold. */
  onCancel?: () => void
  /** Accumulated horizontal pixels needed to turn a page. Default 120. */
  threshold?: number
  /** Detach entirely, e.g. while a dialog is open. Default true. */
  enabled?: boolean
  /**
   * Swallow the gesture without detaching, e.g. while a turn is gliding.
   * Unlike `enabled: false` this keeps tracking the gesture, so the momentum
   * tail of the swipe that caused the turn cannot start a fresh one.
   */
  locked?: boolean
}

const GESTURE_IDLE_MS = 200
// After a turn, demand a longer silence before listening again: the momentum
// tail thins out before it stops, and its last stragglers must not count.
const POST_COMMIT_IDLE_MS = 350
const HORIZONTAL_BIAS = 1.5

/**
 * One trackpad → one gesture tracker. Module-level on purpose: WebKit keeps
 * delivering momentum wheel events for up to a second after the fingers
 * lift, and the page underneath may be re-rendered or swapped meanwhile. A
 * per-instance tracker would start fresh and fire a second turn off that
 * momentum.
 */
const gesture = {
  accumulated: 0,
  fired: false,
  axis: null as 'x' | 'y' | null,
  idleTimer: null as number | null,
  onIdle: null as (() => void) | null,
}

function endGesture() {
  const wasHorizontalAndOpen = gesture.axis === 'x' && !gesture.fired
  const onIdle = gesture.onIdle
  gesture.accumulated = 0
  gesture.fired = false
  gesture.axis = null
  gesture.idleTimer = null
  gesture.onIdle = null
  if (wasHorizontalAndOpen) onIdle?.()
}

function touchIdle(onIdle: (() => void) | null) {
  gesture.onIdle = onIdle
  if (gesture.idleTimer) clearTimeout(gesture.idleTimer)
  gesture.idleTimer = window.setTimeout(endGesture, gesture.fired ? POST_COMMIT_IDLE_MS : GESTURE_IDLE_MS)
}

/** True if the event target sits inside something that actually scrolls sideways. */
function insideHorizontalScroller(target: EventTarget | null, root: HTMLElement): boolean {
  let el = target instanceof Element ? target : null
  while (el && el !== root) {
    const { overflowX } = getComputedStyle(el)
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true
    el = el.parentElement
  }
  return false
}

/**
 * Two-finger horizontal swipe on a Mac trackpad, reported as it happens so
 * the page can follow the fingers. Fingers moving left push the content left
 * (positive deltaX) and turn to the next page; moving right turns back. The
 * listener is passive: nothing in the editor scrolls sideways, so there is
 * nothing to cancel; `overscroll-behavior: none` on body stops the document
 * from rubber-banding.
 */
export function usePageSwipe(ref: RefObject<HTMLElement | null>, opts: PageSwipeOptions): void {
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const enabled = opts.enabled ?? true
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // pinch-zoom arrives as ctrl+wheel
      if (e.deltaMode !== 0) return // mouse wheels report lines, trackpads report pixels
      if (insideHorizontalScroller(e.target, el)) return
      touchIdle(() => optsRef.current.onCancel?.())
      if (optsRef.current.locked) {
        // Keep the gesture alive but spent, so nothing fires until real silence.
        gesture.axis = 'x'
        gesture.fired = true
        return
      }
      if (gesture.axis === null) {
        if (Math.abs(e.deltaX) < 2 && Math.abs(e.deltaY) < 2) return
        gesture.axis = Math.abs(e.deltaX) > Math.abs(e.deltaY) * HORIZONTAL_BIAS ? 'x' : 'y'
      }
      if (gesture.axis !== 'x' || gesture.fired) return
      gesture.accumulated += e.deltaX
      const { threshold = 120, onProgress, onCommit } = optsRef.current
      if (gesture.accumulated > threshold) {
        gesture.fired = true
        onCommit('next')
      } else if (gesture.accumulated < -threshold) {
        gesture.fired = true
        onCommit('prev')
      } else {
        onProgress?.(gesture.accumulated)
      }
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, enabled])
}

import { useEffect, useRef, type RefObject } from 'react'

export interface PageSwipeOptions {
  onNext: () => void
  onPrev: () => void
  /** Accumulated horizontal pixels needed to turn a page. Default 120. */
  threshold?: number
  /** Detach while a dialog is open, etc. Default true. */
  enabled?: boolean
}

const GESTURE_IDLE_MS = 200
const HORIZONTAL_BIAS = 1.5

/**
 * One trackpad → one gesture tracker. Module-level on purpose: a page flip
 * remounts the editor page, and WebKit keeps delivering momentum wheel events
 * for up to a second afterwards. A per-instance tracker would start fresh on
 * the new mount and fire a second flip off that momentum.
 */
const gesture = {
  accumulated: 0,
  fired: false,
  axis: null as 'x' | 'y' | null,
  idleTimer: null as number | null,
}

function endGesture() {
  gesture.accumulated = 0
  gesture.fired = false
  gesture.axis = null
  gesture.idleTimer = null
}

function touchIdle() {
  if (gesture.idleTimer) clearTimeout(gesture.idleTimer)
  gesture.idleTimer = window.setTimeout(endGesture, GESTURE_IDLE_MS)
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
 * Two-finger horizontal swipe on a Mac trackpad → page turn. Fingers moving
 * left push the content left (positive deltaX), which turns to the next page;
 * fingers moving right turn back. Attach to a wrapper that does NOT remount
 * on flip. The listener is passive: nothing in the editor scrolls sideways,
 * so there is nothing to cancel; `overscroll-behavior: none` on body stops
 * the document from rubber-banding.
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
      touchIdle()
      if (gesture.axis === null) {
        if (Math.abs(e.deltaX) < 2 && Math.abs(e.deltaY) < 2) return
        gesture.axis = Math.abs(e.deltaX) > Math.abs(e.deltaY) * HORIZONTAL_BIAS ? 'x' : 'y'
      }
      if (gesture.axis !== 'x' || gesture.fired) return
      gesture.accumulated += e.deltaX
      const { threshold = 120, onNext, onPrev } = optsRef.current
      if (gesture.accumulated > threshold) {
        gesture.fired = true
        onNext()
      } else if (gesture.accumulated < -threshold) {
        gesture.fired = true
        onPrev()
      }
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, enabled])
}

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { usePageSwipe, type FlipDirection } from '../../hooks/usePageSwipe'

export interface PageCarouselHandle {
  /** Glide the track to the neighbouring card; resolves once it has arrived. */
  turn: (dir: FlipDirection) => Promise<void>
  /** Re-centre instantly, once the editor has swapped in the new entry underneath. */
  settle: () => void
  /** Glide back to centre: a flip that could not happen. */
  snap: () => void
}

interface PageCarouselProps {
  /** Static preview of the older entry, or null at the oldest. */
  prev: ReactNode | null
  /** Static preview of the newer entry, or null at the newest. */
  next: ReactNode | null
  /** Whether the trackpad gesture is live. */
  enabled: boolean
  /** The gesture crossed its threshold; the owner decides whether to `turn`. */
  onSwipe: (dir: FlipDirection) => void
  /** The live editor page. Must fill its slot and own its vertical scrolling. */
  children: ReactNode
}

// A turn lands with a small overshoot and settles back onto the card.
const TURN_EASE = 'cubic-bezier(0.34, 1.4, 0.64, 1)'
const TURN_MS = 1260
// A snap back to centre is a plain ease-out.
const SNAP_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
const SNAP_MS = 780
// Finger travel needed to commit a turn.
const THRESHOLD_PX = 360
// The page follows the fingers at this fraction of their travel (weight)...
const FOLLOW = 0.15
// ...and at this fraction when there is no page in that direction.
const RESIST = 0.05
const TILT_DEG = 16
const SIDE_SCALE = 0.08
const SIDE_FADE = 0.5

/**
 * Three cards on a track: the previous entry, the live editor page, and the
 * next entry. Dragging moves the track under the fingers; the side cards sit
 * tilted toward the centre and straighten as they arrive, like flicking
 * through album covers. A turn glides the track one card over; the owner
 * then swaps the editor to that entry and calls `settle`, and because the
 * preview is laid out exactly like the editor page the swap is invisible.
 */
export const PageCarousel = forwardRef<PageCarouselHandle, PageCarouselProps>(function PageCarousel(
  { prev, next, enabled, onSwipe, children },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [x, setX] = useState(0)
  const [animated, setAnimated] = useState<false | 'turn' | 'snap'>(false)
  const [turning, setTurning] = useState(false)
  const pendingRef = useRef<{ done: () => void } | null>(null)

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const finishTurn = () => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    pending.done()
  }

  useImperativeHandle(ref, () => ({
    turn: (dir) =>
      new Promise<void>((resolve) => {
        const w = viewportRef.current?.clientWidth ?? 0
        // Without layout (jsdom, a hidden tab) there is nothing to glide.
        if (w === 0) {
          resolve()
          return
        }
        setAnimated('turn')
        setTurning(true)
        setX(dir === 'next' ? -w : w)
        const timer = window.setTimeout(finishTurn, TURN_MS + 120)
        pendingRef.current = {
          done: () => {
            clearTimeout(timer)
            resolve()
          },
        }
      }),
    settle: () => {
      setAnimated(false)
      setTurning(false)
      setX(0)
    },
    snap: () => {
      setAnimated('snap')
      setTurning(false)
      setX(0)
    },
  }))

  usePageSwipe(viewportRef, {
    enabled,
    // Locked (not detached) while gliding, so the momentum tail of the swipe
    // that caused this turn is spent rather than read as the next swipe.
    locked: turning,
    threshold: THRESHOLD_PX,
    onProgress: (dx) => {
      const hasPage = dx > 0 ? next !== null : prev !== null
      setAnimated(false)
      setX(-dx * (hasPage ? FOLLOW : RESIST))
    },
    onCommit: (dir) => {
      const hasPage = dir === 'next' ? next !== null : prev !== null
      if (hasPage) onSwipe(dir)
      else {
        setAnimated('snap')
        setX(0)
      }
    },
    onCancel: () => {
      setAnimated('snap')
      setX(0)
    },
  })

  const timing = animated === 'turn' ? `${TURN_MS}ms ${TURN_EASE}` : animated === 'snap' ? `${SNAP_MS}ms ${SNAP_EASE}` : null
  const ease = timing ? `transform ${timing}, opacity ${timing}` : 'none'
  const progress = width > 0 ? x / width : 0

  /** Style for the card at slot -1, 0 or 1, given how far the track has moved. */
  const card = (slot: -1 | 0 | 1): React.CSSProperties => {
    const d = slot + progress // 0 = centred, ±1 = one card away
    const away = Math.min(1, Math.abs(d))
    const tilt = TILT_DEG * Math.max(-1, Math.min(1, d))
    return {
      width: '33.3333%', height: '100%', flexShrink: 0,
      transform: `perspective(1400px) rotateY(${tilt.toFixed(2)}deg) scale(${(1 - SIDE_SCALE * away).toFixed(3)})`,
      opacity: 1 - SIDE_FADE * away,
      transition: ease,
      willChange: 'transform, opacity',
    }
  }

  return (
    <div ref={viewportRef} className="flex-1 min-h-0 relative overflow-hidden" style={{ overscrollBehaviorX: 'none' }}>
      <div
        className="absolute inset-y-0 left-0 flex"
        style={{
          width: '300%',
          transform: `translate3d(calc(-33.3333% + ${x}px), 0, 0)`,
          transition: timing ? `transform ${timing}` : 'none',
          willChange: 'transform',
        }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === 'transform') finishTurn()
        }}
      >
        <div style={card(-1)} aria-hidden inert>{prev}</div>
        <div style={card(0)}>{children}</div>
        <div style={card(1)} aria-hidden inert>{next}</div>
      </div>
    </div>
  )
})

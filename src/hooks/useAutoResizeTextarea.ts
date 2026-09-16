import { useLayoutEffect, useCallback, useRef, type RefObject } from 'react'

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

const GLIDE_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  content: string,
  deps: unknown[] = [],
  minHeight: number = 400,
): {
  resize: () => void
  /**
   * Make the next resize glide from the current height to the new one over
   * `ms` instead of snapping. Call it before the content changes for a
   * reason the reader did not type (e.g. swapping to another entry), so any
   * difference in measurement settles smoothly rather than jolting.
   */
  glideNextResize: (ms: number) => void
} {
  const glideMsRef = useRef(0)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    const glideMs = glideMsRef.current
    glideMsRef.current = 0

    // Preserve parent scroll across the height='auto' collapse, which would
    // otherwise clamp scrollTop and snap the view to the bottom on every keystroke.
    const scrollParent = findScrollParent(el)
    const prevScrollTop = scrollParent?.scrollTop ?? 0
    const from = el.offsetHeight
    el.style.transition = 'none'
    el.style.height = 'auto'
    const to = Math.max(minHeight, el.scrollHeight)

    if (glideMs > 0 && from > 0 && from !== to) {
      el.style.height = from + 'px'
      void el.offsetHeight // commit the starting height before transitioning
      el.style.transition = `height ${glideMs}ms ${GLIDE_EASE}`
      el.style.height = to + 'px'
      el.addEventListener('transitionend', () => { el.style.transition = 'none' }, { once: true })
    } else {
      el.style.height = to + 'px'
    }

    if (scrollParent && scrollParent.scrollTop !== prevScrollTop) {
      scrollParent.scrollTop = prevScrollTop
    }
  }, [ref, minHeight])

  // Layout effect: when the editor swaps to another entry the textarea node
  // is reused, so its height must be corrected before the frame paints.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { resize() }, [content, resize, ...deps])

  return {
    resize,
    glideNextResize: useCallback((ms: number) => { glideMsRef.current = ms }, []),
  }
}

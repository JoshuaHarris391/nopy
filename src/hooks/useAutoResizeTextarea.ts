import { useEffect, useCallback, type RefObject } from 'react'

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

export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  content: string,
  deps: unknown[] = [],
  minHeight: number = 400,
): { resize: () => void } {
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    // Preserve parent scroll across the height='auto' collapse, which would
    // otherwise clamp scrollTop and snap the view to the bottom on every keystroke.
    const scrollParent = findScrollParent(el)
    const prevScrollTop = scrollParent?.scrollTop ?? 0
    el.style.height = 'auto'
    el.style.height = Math.max(minHeight, el.scrollHeight) + 'px'
    if (scrollParent && scrollParent.scrollTop !== prevScrollTop) {
      scrollParent.scrollTop = prevScrollTop
    }
  }, [ref, minHeight])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { resize() }, [content, resize, ...deps])

  return { resize }
}

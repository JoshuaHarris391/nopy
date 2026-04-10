import { useEffect, useCallback, type RefObject } from 'react'

export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  content: string,
  deps: unknown[] = [],
  minHeight: number = 400,
): { resize: () => void } {
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(minHeight, el.scrollHeight) + 'px'
  }, [ref, minHeight])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { resize() }, [content, resize, ...deps])

  return { resize }
}

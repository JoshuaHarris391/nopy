import { useEffect, useRef } from 'react'

type Shortcut = 'mod+s' | 'mod+enter' | 'escape' | 'mod+[' | 'mod+]'

function matches(e: KeyboardEvent, shortcut: Shortcut): boolean {
  switch (shortcut) {
    case 'mod+s':     return (e.metaKey || e.ctrlKey) && e.key === 's'
    case 'mod+enter': return (e.metaKey || e.ctrlKey) && e.key === 'Enter'
    case 'escape':    return e.key === 'Escape'
    case 'mod+[':     return (e.metaKey || e.ctrlKey) && e.key === '['
    case 'mod+]':     return (e.metaKey || e.ctrlKey) && e.key === ']'
  }
}

export function useKeyboardShortcut(shortcut: Shortcut, handler: () => void): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (matches(e, shortcut)) {
        e.preventDefault()
        handlerRef.current()
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [shortcut])
}

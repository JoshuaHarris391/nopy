import { useCallback, useEffect, useRef } from 'react'

/**
 * Scroll behavior for the chat message area: momentum-scrolls toward the
 * bottom while streaming (as long as the user is near the bottom), stops
 * chasing when they scroll up to read, and snaps hard to the bottom when
 * they send a new message.
 */
export function useChatScroll(messages: unknown) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const rafRef = useRef<number | null>(null)

  // Smooth momentum scroll toward bottom using lerp
  const smoothScrollToBottom = useCallback(() => {
    if (rafRef.current !== null) return // already running
    const el = scrollContainerRef.current
    if (!el) return

    const tick = () => {
      const target = el.scrollHeight - el.clientHeight
      const current = el.scrollTop
      const delta = target - current

      if (Math.abs(delta) < 1) {
        el.scrollTop = target
        rafRef.current = null
        return
      }

      // Lerp with dampening — 12% per frame feels smooth but responsive
      el.scrollTop += delta * 0.12
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // Trigger smooth scroll on message updates if near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      smoothScrollToBottom()
    }
  }, [messages, smoothScrollToBottom])

  // Cancel any in-flight scroll animation on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distFromBottom < 80
    // If user scrolled up manually, cancel the momentum animation
    if (distFromBottom > 80 && rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  // Hard snap used when the user sends a message: re-arm bottom-following,
  // cancel any momentum animation, and jump once the new messages are in
  // the DOM.
  const snapToBottom = useCallback(() => {
    isNearBottomRef.current = true
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  return { scrollContainerRef, messagesEndRef, handleScroll, snapToBottom }
}

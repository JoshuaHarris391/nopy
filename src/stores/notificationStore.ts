import { create } from 'zustand'

export type NotificationKind = 'error' | 'success' | 'info'

export interface Notification {
  id: string
  kind: NotificationKind
  title: string
  message: string
  ttlMs: number
}

interface NotificationState {
  items: Notification[]
  /**
   * Push a new notification onto the bottom-right stack rendered by
   * `AppShell`. Returns the new id so callers can dismiss programmatically
   * if they want; otherwise the notification auto-dismisses after `ttlMs`.
   * Default TTL is `error` 8000 (long enough to read the catalog copy),
   * `success` 3000, `info` 4000.
   */
  push: (input: { kind: NotificationKind; title: string; message: string; ttlMs?: number }) => string
  dismiss: (id: string) => void
  /** Test helper — clears every notification + its pending timer. */
  clear: () => void
}

const DEFAULT_TTL: Record<NotificationKind, number> = {
  error: 8000,
  success: 3000,
  info: 4000,
}

// Pending auto-dismiss timers, kept outside the zustand state so they can
// be cleared by id without forcing the state into a Map (which would make
// shallow-equality re-renders harder).
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  items: [],

  push: ({ kind, title, message, ttlMs }) => {
    const id = crypto.randomUUID()
    const effectiveTtl = ttlMs ?? DEFAULT_TTL[kind]
    set({ items: [...get().items, { id, kind, title, message, ttlMs: effectiveTtl }] })
    if (effectiveTtl > 0) {
      const timer = setTimeout(() => get().dismiss(id), effectiveTtl)
      timers.set(id, timer)
    }
    return id
  },

  dismiss: (id) => {
    const timer = timers.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(id)
    }
    set({ items: get().items.filter((n) => n.id !== id) })
  },

  clear: () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    set({ items: [] })
  },
}))

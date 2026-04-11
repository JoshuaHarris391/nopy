import { create } from 'zustand'
import { get, set, del } from 'idb-keyval'
import type { ChatSession, ChatSessionMeta, ChatMessage, ChatEntryContext } from '../types/chat'

interface ChatState {
  sessions: ChatSessionMeta[]
  activeSession: ChatSession | null
  activeSessionId: string | null
  loaded: boolean

  loadSessionList: () => Promise<void>
  createSession: (entryContext?: ChatEntryContext) => Promise<string>
  loadSession: (id: string) => Promise<void>
  addMessage: (message: ChatMessage) => Promise<void>
  updateStreamingMessage: (content: string) => void
  finalizeStreamingMessage: () => Promise<void>
  archiveSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  updateSessionTitle: (id: string, title: string) => Promise<void>
  updateSessionSummary: (id: string, summary: string) => Promise<void>
}

function toMeta(session: ChatSession): ChatSessionMeta {
  const lastMsg = session.messages[session.messages.length - 1]
  return {
    id: session.id,
    title: session.title,
    summary: session.summary,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    messageCount: session.messages.length,
    lastMessagePreview: lastMsg ? lastMsg.content.slice(0, 100) : '',
  }
}

export const useChatStore = create<ChatState>()((setState, getState) => ({
  sessions: [],
  activeSession: null,
  activeSessionId: null,
  loaded: false,

  loadSessionList: async () => {
    const meta = await get<ChatSessionMeta[]>('chat:meta')
    console.log('[chatStore] loadSessionList: loaded', (meta ?? []).length, 'sessions')
    setState({ sessions: meta ?? [], loaded: true })
  },

  createSession: async (entryContext?: ChatEntryContext) => {
    console.log('[chatStore] createSession: entryContext present', entryContext != null)
    const now = new Date().toISOString()
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New conversation',
      messages: [],
      summary: null,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      entryContext: entryContext ?? null,
    }
    await set(`chat:session:${session.id}`, session)
    console.log('[chatStore] createSession: created session', session.id)
    const meta = toMeta(session)
    const sessions = [meta, ...getState().sessions]
    setState({ sessions, activeSession: session, activeSessionId: session.id })
    await set('chat:meta', sessions)
    return session.id
  },

  loadSession: async (id) => {
    const session = await get<ChatSession>(`chat:session:${id}`)
    console.log('[chatStore] loadSession: id', id, '| found', session != null, '| messages', session?.messages.length ?? 0)
    if (session) {
      setState({ activeSession: session, activeSessionId: id })
    }
  },

  addMessage: async (message) => {
    const state = getState()
    if (!state.activeSession) return
    console.log('[chatStore] addMessage: role', message.role, '| content', message.content.length, 'chars | session', state.activeSession.id)
    const updatedSession: ChatSession = {
      ...state.activeSession,
      messages: [...state.activeSession.messages, message],
      updatedAt: new Date().toISOString(),
    }
    setState({ activeSession: updatedSession })
    await set(`chat:session:${updatedSession.id}`, updatedSession)

    // Update meta list
    const meta = toMeta(updatedSession)
    const sessions = state.sessions.map((s) => (s.id === meta.id ? meta : s))
    setState({ sessions })
    await set('chat:meta', sessions)
  },

  updateStreamingMessage: (content) => {
    const session = getState().activeSession
    if (!session) return
    const messages = [...session.messages]
    const last = messages[messages.length - 1]
    if (last && last.streaming) {
      messages[messages.length - 1] = { ...last, content }
      setState({ activeSession: { ...session, messages } })
    }
  },

  finalizeStreamingMessage: async () => {
    const session = getState().activeSession
    if (!session) return
    console.log('[chatStore] finalizeStreamingMessage: session', session.id, '| total messages', session.messages.length)
    const messages = session.messages.map((m) =>
      m.streaming ? { ...m, streaming: false } : m,
    )
    const updatedSession: ChatSession = {
      ...session,
      messages,
      updatedAt: new Date().toISOString(),
    }
    setState({ activeSession: updatedSession })
    await set(`chat:session:${updatedSession.id}`, updatedSession)

    const meta = toMeta(updatedSession)
    const sessions = getState().sessions.map((s) => (s.id === meta.id ? meta : s))
    setState({ sessions })
    await set('chat:meta', sessions)
  },

  archiveSession: async (id) => {
    console.log('[chatStore] archiveSession: id', id)
    const session = await get<ChatSession>(`chat:session:${id}`)
    if (session) {
      session.status = 'archived'
      await set(`chat:session:${id}`, session)
    }
    const sessions = getState().sessions.map((s) =>
      s.id === id ? { ...s, status: 'archived' as const } : s,
    )
    setState({ sessions })
    if (getState().activeSessionId === id) {
      setState({ activeSession: null, activeSessionId: null })
    }
    await set('chat:meta', sessions)
  },

  deleteSession: async (id) => {
    console.log('[chatStore] deleteSession: id', id)
    await del(`chat:session:${id}`)
    const sessions = getState().sessions.filter((s) => s.id !== id)
    setState({ sessions })
    if (getState().activeSessionId === id) {
      setState({ activeSession: null, activeSessionId: null })
    }
    await set('chat:meta', sessions)
  },

  updateSessionTitle: async (id, title) => {
    const session = await get<ChatSession>(`chat:session:${id}`)
    if (session) {
      session.title = title
      await set(`chat:session:${id}`, session)
    }
    const sessions = getState().sessions.map((s) =>
      s.id === id ? { ...s, title } : s,
    )
    setState({ sessions })
    const active = getState().activeSession
    if (active && active.id === id) {
      setState({ activeSession: { ...active, title } })
    }
    await set('chat:meta', sessions)
  },

  updateSessionSummary: async (id, summary) => {
    const session = await get<ChatSession>(`chat:session:${id}`)
    if (session) {
      session.summary = summary
      await set(`chat:session:${id}`, session)
    }
    const sessions = getState().sessions.map((s) =>
      s.id === id ? { ...s, summary } : s,
    )
    setState({ sessions })
    const active = getState().activeSession
    if (active && active.id === id) {
      setState({ activeSession: { ...active, summary } })
    }
    await set('chat:meta', sessions)
  },
}))

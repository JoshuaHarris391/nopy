import { create } from 'zustand'
import { get, set, del } from 'idb-keyval'
import type { ChatSession, ChatSessionMeta, ChatMessage, ChatEntryContext } from '../types/chat'
import { scheduleChatSave, loadChatFromDisk } from '../services/chatPersistence'
import { useSettingsStore } from './settingsStore'
import { useJournalStore } from './journalStore'
import { slugify } from '../services/fs'

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
  updateEntryContext: (id: string, entryContext: ChatEntryContext) => Promise<void>
  clear: () => Promise<void>
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

async function _persistToDisk(state: ChatState) {
  const journalPath = useSettingsStore.getState().journalPath
  if (!journalPath) return

  const fullSessions: ChatSession[] = []
  for (const meta of state.sessions) {
    const session = await get<ChatSession>(`chat:session:${meta.id}`)
    if (session) fullSessions.push(session)
  }
  scheduleChatSave(fullSessions, journalPath)
}

export const useChatStore = create<ChatState>()((setState, getState) => ({
  sessions: [],
  activeSession: null,
  activeSessionId: null,
  loaded: false,

  loadSessionList: async () => {
    const meta = await get<ChatSessionMeta[]>('chat:meta')
    if (meta && meta.length > 0) {
      console.log('[chatStore] loadSessionList: loaded', meta.length, 'sessions from IDB')
      setState({ sessions: meta, loaded: true })
      return
    }

    // IDB empty — try loading from disk
    const journalPath = useSettingsStore.getState().journalPath
    if (journalPath) {
      const diskSessions = await loadChatFromDisk(journalPath)
      if (diskSessions.length > 0) {
        const metas: ChatSessionMeta[] = []
        for (const session of diskSessions) {
          await set(`chat:session:${session.id}`, session)
          metas.push(toMeta(session))
        }
        await set('chat:meta', metas)
        console.log('[chatStore] Restored', diskSessions.length, 'sessions from disk')
        setState({ sessions: metas, loaded: true })
        return
      }
    }

    console.log('[chatStore] loadSessionList: no sessions found')
    setState({ sessions: [], loaded: true })
  },

  createSession: async (entryContext?: ChatEntryContext) => {
    console.log('[chatStore] createSession: entryContext present', entryContext != null)
    const now = new Date().toISOString()

    // Derive entryContextRef from journal entries if entryContext is provided
    let entryContextRef: string | null = null
    if (entryContext) {
      const entries = useJournalStore.getState().entries
      const match = entries.find((e) => e.title === entryContext.title)
      entryContextRef = match?.sourceFilename ?? `${slugify(entryContext.title, '')}.md`
    }

    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New conversation',
      messages: [],
      summary: null,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      entryContext: entryContext ?? null,
      entryContextRef,
    }
    await set(`chat:session:${session.id}`, session)
    console.log('[chatStore] createSession: created session', session.id)
    const meta = toMeta(session)
    const sessions = [meta, ...getState().sessions]
    setState({ sessions, activeSession: session, activeSessionId: session.id })
    await set('chat:meta', sessions)
    _persistToDisk(getState())
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
    _persistToDisk(getState())
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
    _persistToDisk(getState())
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
    _persistToDisk(getState())
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
    _persistToDisk(getState())
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
    _persistToDisk(getState())
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
    _persistToDisk(getState())
  },

  updateEntryContext: async (id, entryContext) => {
    const session = await get<ChatSession>(`chat:session:${id}`)
    if (session) {
      session.entryContext = entryContext
      await set(`chat:session:${id}`, session)
    }
    const active = getState().activeSession
    if (active && active.id === id) {
      setState({ activeSession: { ...active, entryContext } })
    }
  },

  clear: async () => {
    const meta = await get<ChatSessionMeta[]>('chat:meta')
    if (meta) {
      for (const s of meta) await del(`chat:session:${s.id}`)
    }
    await del('chat:meta')
    setState({ sessions: [], activeSession: null, activeSessionId: null, loaded: false })
    console.log('[chatStore] Cleared all chat data from IDB')
  },
}))

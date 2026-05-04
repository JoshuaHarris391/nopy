import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ChatSession, ChatMessage, ChatEntryContext } from '../../types/chat'
import type { JournalEntry } from '../../types/journal'

/**
 * In-memory mock of idb-keyval. The chat store is the only writer to
 * `chat:session:<id>` and `chat:meta`, so a single Map is enough to assert
 * round-trips without touching jsdom's missing IndexedDB.
 */
const idbStore = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbStore.set(key, value)
  }),
  del: vi.fn(async (key: string) => {
    idbStore.delete(key)
  }),
}))

/**
 * Mock the chat persistence module so the store's `_persistToDisk` reach
 * never tries to load Tauri's FS plugin in jsdom. The store also short-
 * circuits `_persistToDisk` when `journalPath === ''` (which we set in
 * beforeEach), so this is belt-and-braces.
 */
vi.mock('../../services/chatPersistence', () => ({
  scheduleChatSave: vi.fn(),
  flushChatSave: vi.fn(),
  loadChatFromDisk: vi.fn(async () => []),
}))

import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useJournalStore } from '../../stores/journalStore'

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: 'hello',
    timestamp: '2026-04-13T10:00:00.000Z',
    ...overrides,
  }
}

function makeJournalEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: crypto.randomUUID(),
    title: 'Test entry',
    content: 'body',
    createdAt: '2026-04-13T10:00:00.000Z',
    updatedAt: '2026-04-13T10:00:00.000Z',
    mood: null,
    tags: [],
    summary: null,
    indexed: false,
    ...overrides,
  }
}

beforeEach(() => {
  // Reset the IDB Map so each test sees a clean store.
  idbStore.clear()
  // Empty journalPath short-circuits `_persistToDisk` — keeps these tests
  // focused on chatStore behavior, not the persistence pipeline.
  useSettingsStore.setState({ journalPath: '' })
  useJournalStore.setState({ entries: [] })
  useChatStore.setState({
    sessions: [],
    activeSession: null,
    activeSessionId: null,
    loaded: false,
  })
  vi.clearAllMocks()
})

describe('createSession', () => {
  it('inserts an active session at the head of `sessions`, sets activeSession, and persists to IDB', async () => {
    /**
     * Two state writes and two IDB writes happen on every create. The
     * sessions list is unshifted (newest first) so the SessionPanel renders
     * in chronological-desc order without a re-sort. The local provider
     * will reuse this exact code path; if a refactor accidentally appends
     * instead of unshifts, the new session would be hidden below older ones.
     */
    const id = await useChatStore.getState().createSession()
    const state = useChatStore.getState()

    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].id).toBe(id)
    expect(state.sessions[0].status).toBe('active')
    expect(state.activeSession?.id).toBe(id)
    expect(state.activeSessionId).toBe(id)

    const persistedSession = idbStore.get(`chat:session:${id}`) as ChatSession
    expect(persistedSession.id).toBe(id)
    expect(persistedSession.messages).toEqual([])
    expect(idbStore.get('chat:meta')).toEqual(state.sessions)
  })

  it('derives entryContextRef from a matching journal entry, falling back to a slug when no match', async () => {
    /**
     * `entryContextRef` is the disk path the chat NDJSON points at when it
     * needs to rehydrate the source entry. The store first tries to match
     * by title against `useJournalStore.entries` — when the entry was just
     * written from the editor, `sourceFilename` is the canonical filename.
     * When no match exists (e.g. a session created before the entry was
     * indexed), the store falls back to `${slugify(title)}.md`.
     */
    useJournalStore.setState({
      entries: [makeJournalEntry({ title: 'Indexed thought', sourceFilename: '2026-04-13-indexed-thought.md' })],
    })

    const matchedCtx: ChatEntryContext = { title: 'Indexed thought', content: 'x' }
    const matchedId = await useChatStore.getState().createSession(matchedCtx)
    const matchedSession = idbStore.get(`chat:session:${matchedId}`) as ChatSession
    expect(matchedSession.entryContextRef).toBe('2026-04-13-indexed-thought.md')

    // Reset and try the unmatched fallback.
    idbStore.clear()
    useChatStore.setState({ sessions: [], activeSession: null, activeSessionId: null })

    const unmatchedCtx: ChatEntryContext = { title: 'Unsaved Draft Title', content: 'x' }
    const unmatchedId = await useChatStore.getState().createSession(unmatchedCtx)
    const unmatchedSession = idbStore.get(`chat:session:${unmatchedId}`) as ChatSession
    expect(unmatchedSession.entryContextRef).toBe('unsaved-draft-title.md')
  })
})

describe('addMessage', () => {
  it('appends to messages, updates messageCount and the 100-char preview, and persists', async () => {
    /**
     * The SessionPanel reads `messageCount` and `lastMessagePreview` from
     * the meta list (not from the full session) so the panel stays cheap
     * to render. The preview is sliced to 100 chars — important because
     * an LLM reply could be thousands of chars and we don't want to dump
     * that into a sidebar tooltip.
     */
    const id = await useChatStore.getState().createSession()
    const longContent = 'A'.repeat(250)
    await useChatStore.getState().addMessage(makeMessage({ role: 'assistant', content: longContent }))

    const state = useChatStore.getState()
    expect(state.activeSession?.messages).toHaveLength(1)
    expect(state.sessions[0].messageCount).toBe(1)
    expect(state.sessions[0].lastMessagePreview).toHaveLength(100)
    expect(state.sessions[0].lastMessagePreview).toBe('A'.repeat(100))

    const persisted = idbStore.get(`chat:session:${id}`) as ChatSession
    expect(persisted.messages).toHaveLength(1)
    expect(persisted.messages[0].content).toBe(longContent)
  })

  it('is a no-op when there is no active session', async () => {
    /**
     * Defensive: a stray addMessage from a unmounted view shouldn't create
     * a phantom session. The store early-returns and leaves IDB untouched.
     */
    await useChatStore.getState().addMessage(makeMessage())
    expect(useChatStore.getState().sessions).toHaveLength(0)
    expect(idbStore.size).toBe(0)
  })
})

describe('updateStreamingMessage', () => {
  it('replaces the last message content only when the last message has streaming:true', async () => {
    /**
     * The streaming-mutation contract: only the *last* message gets its
     * content replaced, and only if it was the placeholder added with
     * `streaming: true`. Without this guard, an LLM token chunk could
     * overwrite the user's prior message text mid-stream.
     */
    await useChatStore.getState().createSession()
    await useChatStore.getState().addMessage(makeMessage({ role: 'user', content: 'user said' }))

    // Last message has no `streaming` flag — must be a no-op.
    useChatStore.getState().updateStreamingMessage('SHOULD NOT APPEAR')
    expect(useChatStore.getState().activeSession?.messages[0].content).toBe('user said')

    // Add a streaming placeholder, then the update should land.
    await useChatStore.getState().addMessage(makeMessage({ role: 'assistant', content: '', streaming: true }))
    useChatStore.getState().updateStreamingMessage('partial')
    const messages = useChatStore.getState().activeSession?.messages ?? []
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('user said')
    expect(messages[1].content).toBe('partial')
    expect(messages[1].streaming).toBe(true)
  })

  it('is a no-op when there is no active session', () => {
    useChatStore.getState().updateStreamingMessage('orphan')
    expect(useChatStore.getState().activeSession).toBeNull()
  })
})

describe('finalizeStreamingMessage', () => {
  it('clears streaming flags on every message and persists to IDB', async () => {
    /**
     * After a stream completes, every message that had `streaming: true`
     * must have it cleared (in practice this is just the last one, but the
     * store maps over all messages defensively). The cleared session lands
     * in IDB so a reload doesn't show a stuck "..." indicator on the last
     * assistant message.
     */
    const id = await useChatStore.getState().createSession()
    await useChatStore.getState().addMessage(makeMessage({ role: 'assistant', content: 'final', streaming: true }))
    await useChatStore.getState().finalizeStreamingMessage()

    const session = useChatStore.getState().activeSession!
    expect(session.messages[0].streaming).toBe(false)

    const persisted = idbStore.get(`chat:session:${id}`) as ChatSession
    expect(persisted.messages[0].streaming).toBe(false)
  })
})

describe('end-to-end streaming contract', () => {
  it('createSession → addMessage(user) → addMessage(assistant streaming) → updateStreamingMessage × N → finalize', async () => {
    /**
     * This is THE test the LM Studio refactor must keep green. Whichever
     * provider produces the token stream, the store sequence is fixed:
     *
     *   addMessage(streaming:true)
     *   updateStreamingMessage('Hel')
     *   updateStreamingMessage('Hello')
     *   finalizeStreamingMessage()
     *
     * After finalize: exactly two messages, the assistant's final content
     * matches the last token-chunk argument, the streaming flag is cleared,
     * and IDB matches in-memory. Any provider implementation that satisfies
     * this — by calling these exact mutations in this order — is correct.
     */
    const id = await useChatStore.getState().createSession()
    await useChatStore.getState().addMessage(makeMessage({ role: 'user', content: 'hi' }))
    await useChatStore.getState().addMessage(makeMessage({ role: 'assistant', content: '', streaming: true }))

    useChatStore.getState().updateStreamingMessage('Hel')
    useChatStore.getState().updateStreamingMessage('Hello')
    await useChatStore.getState().finalizeStreamingMessage()

    const session = useChatStore.getState().activeSession!
    expect(session.messages).toHaveLength(2)
    expect(session.messages[0].role).toBe('user')
    expect(session.messages[1].role).toBe('assistant')
    expect(session.messages[1].content).toBe('Hello')
    expect(session.messages[1].streaming).toBe(false)

    // IDB matches in-memory.
    const persisted = idbStore.get(`chat:session:${id}`) as ChatSession
    expect(persisted.messages).toEqual(session.messages)
    expect(persisted.updatedAt).toBe(session.updatedAt)
  })
})

describe('archiveSession / deleteSession', () => {
  it('archive flips status to "archived" and clears active when the archived session was active', async () => {
    /**
     * Archive must not delete the session — old conversations stay
     * accessible via the "Archived" filter in SessionPanel. But if the
     * archived session was the one being viewed, `activeSession` must be
     * cleared so the chat UI returns to the empty state.
     */
    const id = await useChatStore.getState().createSession()
    await useChatStore.getState().archiveSession(id)

    const state = useChatStore.getState()
    expect(state.sessions[0].status).toBe('archived')
    expect(state.activeSession).toBeNull()
    expect(state.activeSessionId).toBeNull()

    // Session itself is still in IDB, just marked archived.
    const persisted = idbStore.get(`chat:session:${id}`) as ChatSession
    expect(persisted.status).toBe('archived')
  })

  it('delete removes the session from IDB and from the sessions list', async () => {
    /**
     * Hard delete: gone from IDB, gone from the panel list. Any subsequent
     * `loadSession(id)` would return `undefined` from IDB and the store
     * leaves activeSession unchanged — but here we just assert the removal.
     */
    const id = await useChatStore.getState().createSession()
    await useChatStore.getState().deleteSession(id)

    expect(useChatStore.getState().sessions).toHaveLength(0)
    expect(idbStore.has(`chat:session:${id}`)).toBe(false)
    expect(useChatStore.getState().activeSession).toBeNull()
  })
})

describe('forward-looking provider parity (todo)', () => {
  // Pinned for the multi-provider refactor in docs/tasks/10-gemma4-local-integration.md.
  // The local provider's streaming code must produce byte-identical chat-store
  // mutations to the Anthropic flow above for the same token sequence.
  it.todo('local provider streaming produces identical chat-store mutations to Anthropic for the same token sequence')
})

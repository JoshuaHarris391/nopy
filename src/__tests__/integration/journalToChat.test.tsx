import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * In-memory mock of idb-keyval. The journal, chat, and settings stores all
 * persist through these calls; jsdom does not implement IndexedDB so a real
 * call would throw. A single Map keyed by string|key emulates the API.
 */
const idbStore = new Map<unknown, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: unknown) => idbStore.get(key)),
  set: vi.fn(async (key: unknown, value: unknown) => {
    idbStore.set(key, value)
  }),
  del: vi.fn(async (key: unknown) => {
    idbStore.delete(key)
  }),
}))

/**
 * Mock of the Anthropic SDK wrapper. We do not exercise the real network or
 * real streaming — instead the mock captures the arguments the chat flow
 * passes to streamChatResponse so we can assert what the LLM "would have seen".
 * onComplete is invoked synchronously so the streaming finalization runs
 * within the same act() flush.
 *
 * vi.hoisted is required because vi.mock factories are hoisted to the top of
 * the file; referencing a regular top-level const inside the factory throws
 * "Cannot access 'X' before initialization".
 */
const { streamChatResponseMock, sendMessageMock } = vi.hoisted(() => ({
  streamChatResponseMock: vi.fn(),
  sendMessageMock: vi.fn(async () => 'Generated Title'),
}))
vi.mock('../../services/anthropic', () => ({
  streamChatResponse: streamChatResponseMock,
  sendMessage: sendMessageMock,
  sendMessageStreaming: vi.fn(),
  fetchModels: vi.fn(async () => []),
  getClient: vi.fn(),
}))

// Imports must follow vi.mock to ensure modules see the mocked deps.
import { EntryEditor } from '../../components/journal/EntryEditor'
import { ChatView } from '../../components/chat/ChatView'
import { useSettingsStore } from '../../stores/settingsStore'
import { useJournalStore } from '../../stores/journalStore'
import { useChatStore } from '../../stores/chatStore'
import { useProfileStore } from '../../stores/profileStore'

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/journal/new']}>
      <Routes>
        <Route path="/journal/new" element={<EntryEditor />} />
        <Route path="/journal/:id" element={<EntryEditor />} />
        <Route path="/chat" element={<ChatView />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Journal entry → first chat message', () => {
  beforeEach(() => {
    // jsdom does not implement matchMedia; ChatView calls it to set the
    // session-panel collapse state on narrow screens. Polyfill with a stub
    // that always reports "not narrow" so the panel stays visible.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    idbStore.clear()
    streamChatResponseMock.mockReset()
    streamChatResponseMock.mockImplementation(
      async (
        _apiKey: string,
        _model: string,
        _system: string,
        _messages: unknown[],
        _max: number,
        _onChunk: (s: string) => void,
        onComplete: (s: string) => void,
      ) => {
        // Resolve in a microtask so the awaited call in handleSend completes
        // and onComplete fires before our assertions run.
        await Promise.resolve()
        onComplete('mock response')
      },
    )
    sendMessageMock.mockClear()

    // Reset zustand stores. Settings has apiKey + journalPath pre-seeded so
    // ChatView's effect guard (`!apiKey || !loaded`) passes.
    useSettingsStore.setState({
      apiKey: 'test-key',
      journalPath: '/test/journal',
      preferredModel: 'claude-sonnet-4-5',
      maxOutputTokens: 4096,
      contextBudget: 30000,
    })
    useJournalStore.setState({ entries: [], loaded: false, lastError: null })
    useChatStore.setState({
      sessions: [],
      activeSession: null,
      activeSessionId: null,
      loaded: false,
    })
    useProfileStore.setState({ profile: null })
  })

  it('injects journal entry content into the first AI request when Start Session is clicked', async () => {
    /**
     * Reproduces a user-reported bug: creating a new entry, saving, and
     * clicking Start Session produces a first AI message that does not see
     * the journal entry contents — the AI replies as if it had no context.
     * Clicking Start Session a second time (via a fresh navigation back to
     * the entry) then works.
     *
     * Root cause being pinned by this test:
     *   - ChatView.handleSend is a useCallback that captures activeSessionId
     *     (initially null) in its closure.
     *   - The router-state useEffect awaits createSession(entryContext) and
     *     then setTimeout(() => handleSend(message), 100).
     *   - The timeout fires the OLD handleSend closure: it sees sessionId
     *     null, calls createSession() again — this time WITHOUT the entry
     *     context — and that orphan session becomes active. assembleContext
     *     is then called against the orphan, so the entry never reaches the
     *     LLM.
     *
     * Input: user types title + content, presses Cmd+S to save, clicks
     * Start Session.
     * Expected output: streamChatResponse is called exactly once and its
     * `system` argument contains the entry title and content under the
     * "Current Session Focus" header. The first message is the visible
     * "Let's talk about ..." prompt.
     */
    renderApp()

    const titleInput = await screen.findByPlaceholderText("What's on your mind today?")
    const contentInput = await screen.findByPlaceholderText('Begin writing...')

    const ENTRY_TITLE = 'My anxious Tuesday'
    const ENTRY_CONTENT = 'I felt a knot in my chest before the standup.'

    fireEvent.change(titleInput, { target: { value: ENTRY_TITLE } })
    fireEvent.change(contentInput, { target: { value: ENTRY_CONTENT } })

    // Cmd+S → useKeyboardShortcut('mod+s') triggers an immediate handleSave,
    // bypassing the 1500 ms autosave debounce.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }))
    })

    await waitFor(() => {
      const entries = useJournalStore.getState().entries
      expect(entries).toHaveLength(1)
      expect(entries[0].title).toBe(ENTRY_TITLE)
      expect(entries[0].content).toBe(ENTRY_CONTENT)
    })

    const startBtn = await screen.findByRole('button', { name: /start session/i })
    await act(async () => {
      fireEvent.click(startBtn)
    })

    // ChatView mounts → loadSessionList → entry-context effect →
    // setTimeout(handleSend, 100). Wait long enough for the chain.
    await waitFor(
      () => {
        expect(streamChatResponseMock).toHaveBeenCalled()
      },
      { timeout: 3000 },
    )

    expect(streamChatResponseMock).toHaveBeenCalledTimes(1)

    // Args: (apiKey, model, system, messages, maxTokens, onChunk, onComplete, onError)
    const call = streamChatResponseMock.mock.calls[0]
    const systemPrompt = call[2] as string
    const messages = call[3] as { role: string; content: string }[]

    expect(systemPrompt).toContain('Current Session Focus')
    expect(systemPrompt).toContain(ENTRY_TITLE)
    expect(systemPrompt).toContain(ENTRY_CONTENT)
    expect(messages[0].content).toContain(ENTRY_TITLE)
  })
})

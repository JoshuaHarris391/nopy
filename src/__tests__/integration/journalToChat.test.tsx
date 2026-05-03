import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, waitFor, act, cleanup } from '@testing-library/react'
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
import type { PsychologicalProfile } from '../../types/profile'

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

function renderChatOnly() {
  return render(
    <MemoryRouter initialEntries={['/chat']}>
      <Routes>
        <Route path="/chat" element={<ChatView />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Sentinel string used to assert the profile reached the LLM. Picked to be
// unique enough that no other piece of the system prompt could contain it.
const PROFILE_MARKER = 'PROFILE-MARKER: tends toward perfectionism under stress.'

function makeProfile(overrides: Partial<PsychologicalProfile> = {}): PsychologicalProfile {
  return {
    summary: 'A brief profile summary.',
    themes: [],
    cognitivePatterns: [],
    emotionalTrends: [],
    growthAreas: [],
    strengths: [],
    frameworkInsights: [],
    averageMood: 7,
    journalingStreak: 3,
    avgEntryLength: 200,
    reflectionDepth: 'Medium',
    updatedAt: new Date().toISOString(),
    entriesAnalyzed: 5,
    fullProfile: null,
    ...overrides,
  }
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

  afterEach(() => {
    // Vitest does not enable RTL globals here, so unmount any rendered tree
    // between tests. Without this, the previous test's <ChatView> stays in
    // the DOM and screen.findByRole picks up duplicates (or fires on the
    // wrong instance).
    cleanup()
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

  it('injects the psychological profile into the system prompt when starting a brand-new chat', async () => {
    /**
     * Verifies that opening the chat from the empty state, creating a new
     * conversation, and sending a first message results in the user's
     * generated psychological profile appearing in the system prompt sent to
     * the LLM. This is the personalisation signal the therapist AI relies on
     * to tailor its first response.
     *
     * What this guards against: ChatView.handleSend reads the profile via
     * useProfileStore.getState().profile at call time (ChatView.tsx:190). A
     * regression that swapped this for a render-time selector — captured in
     * the useCallback closure — would silently strip the profile from the
     * very first message of every new conversation, because the closure
     * snapshots before the user has had a chance to load or generate their
     * profile in this session. The full profile is the more important branch
     * (lines 32-34 of contextAssembler) so we test that variant.
     *
     * Input: profile.fullProfile set to PROFILE_MARKER, user clicks "New
     * conversation" then types and sends a message in a chat with no journal
     * entry context.
     * Expected output: streamChatResponse is called once and its system
     * prompt argument contains both the "## Psychological Profile" header
     * and the PROFILE_MARKER sentinel.
     */
    useProfileStore.setState({
      profile: makeProfile({ fullProfile: PROFILE_MARKER }),
      loaded: true,
    })

    renderChatOnly()

    // Empty state — click the "New conversation" button to create a fresh
    // session. The textarea only renders once activeSession exists.
    const newBtn = await screen.findByRole('button', { name: /new conversation/i })
    await act(async () => {
      fireEvent.click(newBtn)
    })

    const textarea = await screen.findByPlaceholderText(/share what's on your mind/i)

    const FIRST_MESSAGE = 'I want to talk about how my week has been.'
    await act(async () => {
      fireEvent.change(textarea, { target: { value: FIRST_MESSAGE } })
    })
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter' })
    })

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

    expect(systemPrompt).toContain('## Psychological Profile')
    expect(systemPrompt).toContain(PROFILE_MARKER)
    // Confirm the typed message reached the LLM — proves the new session was
    // actually created and the send went through (not just that the mock was
    // called from some unrelated code path).
    expect(messages[0].content).toBe(FIRST_MESSAGE)
  })

  it('loads the psychological profile from IndexedDB on chat mount and injects it into the first message', async () => {
    /**
     * Reproduces a real load-order bug: the user has a generated profile
     * persisted in IndexedDB (key "nopy-profile"), but profileStore.profile
     * is still null in memory because nothing has called loadProfile() yet.
     * Today, loadProfile is only called from ProfileView's mount effect
     * (ProfileView.tsx:53). A user who opens the app and goes straight to
     * Chat without first visiting the Profile page will send their first
     * message with profile=null in handleSend, and the system prompt will
     * have no profile injected — the AI silently loses all personalisation.
     *
     * This test isolates that load-order bug by populating only the mocked
     * IDB (NOT the store) and leaves profileStore at its post-beforeEach
     * default (profile: null, loaded: false). It will fail on any code path
     * where ChatView/handleSend does not ensure the profile is loaded
     * before reading it.
     *
     * Input: a profile written to idbStore['nopy-profile'] before render;
     * profileStore.profile is null; user clicks "New conversation", types,
     * and sends.
     * Expected output: streamChatResponse system prompt contains
     * PROFILE_MARKER (the profile was loaded from IDB and injected).
     */
    // Force profileStore back to its app-start state. The shared beforeEach
    // resets `profile: null` but does not reset `loaded`, so a prior test
    // (or the fix's mount-effect calling loadProfile) can leave loaded=true
    // and bypass the load path we're trying to exercise here.
    useProfileStore.setState({ profile: null, loaded: false })

    // Seed the mocked IDB with a profile, but DO NOT touch profileStore.
    // This mirrors the real-world state at app start: profile is on disk
    // (and in IDB if loaded previously), but the in-memory store is empty
    // until something calls loadProfile().
    idbStore.set('nopy-profile', makeProfile({ fullProfile: PROFILE_MARKER }))

    renderChatOnly()

    const newBtn = await screen.findByRole('button', { name: /new conversation/i })
    await act(async () => {
      fireEvent.click(newBtn)
    })

    const textarea = await screen.findByPlaceholderText(/share what's on your mind/i)

    const FIRST_MESSAGE = 'How do I stop spiralling at night?'
    await act(async () => {
      fireEvent.change(textarea, { target: { value: FIRST_MESSAGE } })
    })
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter' })
    })

    await waitFor(
      () => {
        expect(streamChatResponseMock).toHaveBeenCalled()
      },
      { timeout: 3000 },
    )

    const call = streamChatResponseMock.mock.calls[0]
    const systemPrompt = call[2] as string

    expect(systemPrompt).toContain('## Psychological Profile')
    expect(systemPrompt).toContain(PROFILE_MARKER)
  })

  it('injects the psychological profile into the system prompt when Start Session is clicked', async () => {
    /**
     * Verifies that the Start Session flow from the journal editor injects
     * BOTH the focused journal entry and the user's psychological profile
     * into the first AI request. The existing "injects journal entry content"
     * test above proves the entry path; this test extends that scenario with
     * a profile set in profileStore and asserts it survives the same flow.
     *
     * What this guards against: a fix that adds profile injection but breaks
     * the entry path (or vice versa). Both must reach the LLM in the same
     * call for the conversation to feel personalised AND focused on the
     * entry the user just wrote about.
     *
     * Input: profile.fullProfile set to PROFILE_MARKER, user types title +
     * content, presses Cmd+S to save, clicks Start Session.
     * Expected output: streamChatResponse is called once with a system
     * prompt containing the profile header, PROFILE_MARKER, the
     * "Current Session Focus" header, the entry title, and the entry content.
     */
    useProfileStore.setState({
      profile: makeProfile({ fullProfile: PROFILE_MARKER }),
      loaded: true,
    })

    renderApp()

    const titleInput = await screen.findByPlaceholderText("What's on your mind today?")
    const contentInput = await screen.findByPlaceholderText('Begin writing...')

    const ENTRY_TITLE = 'A reflective Wednesday'
    const ENTRY_CONTENT = 'Some context for the AI to chew on.'

    fireEvent.change(titleInput, { target: { value: ENTRY_TITLE } })
    fireEvent.change(contentInput, { target: { value: ENTRY_CONTENT } })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }))
    })

    await waitFor(() => {
      expect(useJournalStore.getState().entries).toHaveLength(1)
    })

    const startBtn = await screen.findByRole('button', { name: /start session/i })
    await act(async () => {
      fireEvent.click(startBtn)
    })

    await waitFor(
      () => {
        expect(streamChatResponseMock).toHaveBeenCalled()
      },
      { timeout: 3000 },
    )

    expect(streamChatResponseMock).toHaveBeenCalledTimes(1)

    const call = streamChatResponseMock.mock.calls[0]
    const systemPrompt = call[2] as string

    expect(systemPrompt).toContain('## Psychological Profile')
    expect(systemPrompt).toContain(PROFILE_MARKER)
    // The entry must still land in the same prompt — guards against a future
    // change that adds profile injection but regresses the Start Session
    // entry-context path.
    expect(systemPrompt).toContain('Current Session Focus')
    expect(systemPrompt).toContain(ENTRY_TITLE)
    expect(systemPrompt).toContain(ENTRY_CONTENT)
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * In-memory mock of idb-keyval. The chat, journal, and profile stores all
 * persist through these calls; jsdom does not implement IndexedDB. A single
 * Map keyed by string|key emulates the API.
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
 * Mock the LLM dispatcher so each test drives its own chunk/complete/error
 * sequence — no real network, no provider modules involved. We pull the
 * real `LlmError` and `LLM_ERROR_MESSAGES` so case B can construct an
 * authentic dispatcher error.
 *
 * vi.hoisted is required because vi.mock factories are hoisted above
 * regular top-level consts.
 */
const { streamChatResponseMock, sendMessageMock } = vi.hoisted(() => ({
  streamChatResponseMock: vi.fn(),
  sendMessageMock: vi.fn(async () => 'Generated Title'),
}))
vi.mock('../../services/llm', async () => {
  const actual = await vi.importActual<typeof import('../../services/llm')>('../../services/llm')
  return {
    ...actual,
    streamChatResponse: streamChatResponseMock,
    sendMessage: sendMessageMock,
  }
})

/**
 * Mock the heavy sidebar / bottom-nav components so AppShell mounts with
 * minimal dependencies. The component-under-test (ChatView) and the
 * notification stack are what we care about.
 */
vi.mock('../../components/sidebar/Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }))
vi.mock('../../components/sidebar/BottomNav', () => ({ BottomNav: () => <div data-testid="bottom-nav" /> }))

import { AppShell } from '../../app/AppShell'
import { ChatView } from '../../components/chat/ChatView'
import { useSettingsStore } from '../../stores/settingsStore'
import { useJournalStore } from '../../stores/journalStore'
import { useChatStore } from '../../stores/chatStore'
import { useProfileStore } from '../../stores/profileStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { LlmError, LLM_ERROR_MESSAGES } from '../../services/llm'

function renderChatInsideShell() {
  return render(
    <MemoryRouter initialEntries={['/chat']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/chat" element={<ChatView />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // jsdom doesn't implement matchMedia; ChatView uses it for the
  // session-panel collapse check on narrow screens.
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
  sendMessageMock.mockClear()
  useNotificationStore.getState().clear()

  // Settings: anthropic mode with a valid api key so the chat composer
  // is enabled. (The dispatcher is mocked; the actual provider doesn't
  // matter — we just need ready=true.)
  useSettingsStore.setState({
    apiKey: 'test-key',
    journalPath: '',
    preferredModel: 'claude-sonnet-4-5',
    anthropicLightweightModel: 'claude-haiku-4-5',
    maxOutputTokens: 4096,
    contextBudget: 30000,
    provider: 'anthropic',
    localBaseUrl: 'http://localhost:1234/v1',
    localModel: '',
  })
  useJournalStore.setState({ entries: [], loaded: true })
  useChatStore.setState({
    sessions: [],
    activeSession: null,
    activeSessionId: null,
    loaded: true,
  })
  useProfileStore.setState({ profile: null, loaded: true })
})

afterEach(() => {
  cleanup()
  useNotificationStore.getState().clear()
})

describe('Chat stream → DOM rendering', () => {
  it('streamed assistant reply appears in the chat window after onChunk + onComplete', async () => {
    /**
     * The headline assertion the user asked for: prove that when the
     * dispatcher streams "Hello" via onChunk callbacks and finishes via
     * onComplete, the rendered chat shows "Hello" inside the assistant
     * message. This is the end-to-end render test we didn't have before
     * — the existing chatStore.test.ts asserts store mutations, but
     * nothing previously asserted that those mutations reach the DOM.
     */
    streamChatResponseMock.mockImplementation(
      async (
        _config: unknown,
        _model: string,
        _system: string,
        _messages: unknown,
        _max: number,
        onChunk: (s: string) => void,
        onComplete: (s: string) => void,
      ) => {
        // Microtask so handleSend's awaited addMessage() calls settle before
        // the chunks arrive — matches the production order.
        await Promise.resolve()
        onChunk('Hel')
        onChunk('Hello')
        await onComplete('Hello')
      },
    )

    renderChatInsideShell()

    const newBtn = await screen.findByRole('button', { name: /new conversation/i })
    fireEvent.click(newBtn)

    const textarea = await screen.findByPlaceholderText(/share what's on your mind/i)
    fireEvent.change(textarea, { target: { value: 'hi' } })

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })
    })

    // The streamed text lands inside the assistant message body. Use
    // findByText with a function so we match the rendered "Hello" even if
    // it's wrapped by markdown <p> tags.
    await waitFor(() => {
      const assistantHello = screen.getAllByText((_, node) => node?.textContent === 'Hello')
      expect(assistantHello.length).toBeGreaterThan(0)
    })
  })

  it('onError surfaces a notification AND renders the error inline AND skips title generation', async () => {
    /**
     * The bug this whole PR is here to fix. Drives onError with the same
     * LlmError(CONTEXT_TOO_LARGE) the localServer SSE parser now throws
     * when LM Studio's stream emits an error event mid-response. After
     * the fix:
     *   (a) The bottom-right notification card shows the actionable copy.
     *   (b) The inline assistant message also renders the same copy so
     *       the chat history reflects what happened.
     *   (c) The title-gen sendMessage is NOT called — previously, an
     *       empty onComplete fired and triggered a phantom title.
     */
    streamChatResponseMock.mockImplementation(
      async (
        _config: unknown,
        _model: string,
        _system: string,
        _messages: unknown,
        _max: number,
        _onChunk: (s: string) => void,
        _onComplete: (s: string) => void,
        onError: (e: Error) => void,
      ) => {
        await Promise.resolve()
        onError(new LlmError('CONTEXT_TOO_LARGE', LLM_ERROR_MESSAGES.CONTEXT_TOO_LARGE))
      },
    )

    renderChatInsideShell()

    const newBtn = await screen.findByRole('button', { name: /new conversation/i })
    fireEvent.click(newBtn)

    const textarea = await screen.findByPlaceholderText(/share what's on your mind/i)
    fireEvent.change(textarea, { target: { value: 'hi' } })
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })
    })

    // (a) Notification card renders. AppShell's stack uses NotificationCard
    // which has role="status"; the chat-error one uses kind=error → coral
    // accent + our title "Chat error".
    await waitFor(() => {
      expect(screen.getByText('Chat error')).toBeInTheDocument()
    })
    // (b) Inline assistant message contains the actionable copy. We assert
    // on a substring unique to the new CONTEXT_TOO_LARGE message so a
    // future copy change here will catch the disconnect.
    await waitFor(() => {
      const matches = screen.getAllByText((_, node) =>
        (node?.textContent ?? '').includes("Your prompt is too large for this model's context window"),
      )
      // At least one in the notification card + one inline in the assistant
      // bubble, but both use the same string so 1+ is the meaningful check.
      expect(matches.length).toBeGreaterThan(0)
    })
    // (c) Title gen NOT called — sendMessage mock is the title generator.
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('a notification can be manually dismissed via the × button', async () => {
    /**
     * The NotificationCard exposes onDismiss when push() backs the card
     * (the indexing/profile-gen progress cards don't expose it because
     * they auto-disappear with their store state). Clicking × removes
     * the card and clears its TTL timer.
     */
    useNotificationStore.getState().push({
      kind: 'error',
      title: 'Chat error',
      message: 'something went wrong',
    })
    renderChatInsideShell()

    const dismiss = await screen.findByRole('button', { name: /dismiss notification/i })
    fireEvent.click(dismiss)

    await waitFor(() => {
      expect(screen.queryByText('Chat error')).not.toBeInTheDocument()
    })
  })
})

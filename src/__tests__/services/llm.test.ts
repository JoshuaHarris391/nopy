import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { LlmConfig } from '../../types/settings'

/**
 * Mock both provider modules so this test exercises only the dispatcher's
 * routing logic — never makes real HTTP, never depends on the SDK or fetch
 * behavior. Each provider module exports the same five functions, so the
 * mocks expose identical surfaces.
 *
 * vi.hoisted is required because vi.mock factories run before regular
 * top-level consts are initialized.
 */
const { anthropicMocks, localMocks } = vi.hoisted(() => ({
  anthropicMocks: {
    streamChatResponse: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => 'anthropic-result'),
    sendMessageStreaming: vi.fn(async () => 'anthropic-streamed'),
    fetchModels: vi.fn(async () => [{ id: 'claude-haiku', displayName: 'Haiku' }]),
  },
  localMocks: {
    streamChatResponse: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => 'local-result'),
    sendMessageStreaming: vi.fn(async () => 'local-streamed'),
    fetchModels: vi.fn(async () => [{ id: 'gemma', displayName: 'gemma' }]),
  },
}))

vi.mock('../../services/anthropic', () => anthropicMocks)
vi.mock('../../services/localServer', () => localMocks)

import { streamChatResponse, sendMessage, sendMessageStreaming, fetchModels, LlmError } from '../../services/llm'

const ANTHROPIC: LlmConfig = {
  provider: 'anthropic',
  apiKey: 'sk-x',
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: '',
}
const LOCAL: LlmConfig = {
  provider: 'local',
  apiKey: '',
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: 'gemma',
}

beforeEach(() => {
  for (const fn of Object.values(anthropicMocks)) fn.mockClear()
  for (const fn of Object.values(localMocks)) fn.mockClear()
})

describe('streamChatResponse routing', () => {
  it('routes to anthropic when provider is "anthropic", forwarding apiKey + requestedModel unchanged', async () => {
    /**
     * Anthropic mode is the default and the path every existing user is
     * on. The dispatcher must pass the caller's `requestedModel` through
     * unchanged — that's how ChatView sends the user's preferred model
     * and how entryProcessor sends HAIKU_MODEL or OPUS_MODEL for one-shot
     * tasks.
     */
    await streamChatResponse(ANTHROPIC, 'claude-sonnet', 'sys', [{ role: 'user', content: 'hi' }], 100, () => {}, () => {}, () => {})
    expect(anthropicMocks.streamChatResponse).toHaveBeenCalledTimes(1)
    expect(localMocks.streamChatResponse).not.toHaveBeenCalled()
    const args = anthropicMocks.streamChatResponse.mock.calls[0] as unknown[]
    expect(args[0]).toBe('sk-x')           // apiKey
    expect(args[1]).toBe('claude-sonnet')  // requestedModel honored
  })

  it('routes to localServer when provider is "local" and overrides requestedModel with config.localModel', async () => {
    /**
     * In local mode the dispatcher MUST ignore whatever model the caller
     * passed (e.g. ChatView's preferredModel "claude-sonnet-4-5" or
     * entryProcessor's HAIKU_MODEL) and use config.localModel instead —
     * LM Studio loads one model at a time and asking it for an
     * unknown model id returns 404. This is the *only* place that
     * remapping happens; getting it wrong here breaks every local call
     * site at once.
     */
    await streamChatResponse(LOCAL, 'claude-sonnet', 'sys', [{ role: 'user', content: 'hi' }], 100, () => {}, () => {}, () => {})
    expect(localMocks.streamChatResponse).toHaveBeenCalledTimes(1)
    expect(anthropicMocks.streamChatResponse).not.toHaveBeenCalled()
    const args = localMocks.streamChatResponse.mock.calls[0] as unknown[]
    expect(args[0]).toBe('http://localhost:1234/v1') // baseUrl
    expect(args[1]).toBe('gemma')                    // localModel, NOT 'claude-sonnet'
  })

  it('reports NO_MODEL_CONFIGURED via onError when local + empty localModel', async () => {
    /**
     * The user is in local mode but hasn't typed a model name yet. The
     * dispatcher must fail fast — calling LM Studio with an empty model
     * is a 400 error (and arguably a worse one than the typed catalog
     * message we want to surface). Reporting via onError (rather than
     * throwing) keeps the streaming caller's error handling consistent
     * with how it deals with mid-stream failures.
     */
    const errors: unknown[] = []
    await streamChatResponse(
      { ...LOCAL, localModel: '' }, 'irrelevant', 'sys', [], 100,
      () => {}, () => {}, (e) => errors.push(e),
    )
    expect(localMocks.streamChatResponse).not.toHaveBeenCalled()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(LlmError)
    expect((errors[0] as LlmError).code).toBe('NO_MODEL_CONFIGURED')
  })
})

describe('sendMessage / sendMessageStreaming routing', () => {
  it('sendMessage routes by provider and overrides model in local mode', async () => {
    /**
     * entryProcessor.processEntry calls sendMessage with HAIKU_MODEL —
     * meaningful in Anthropic mode, ignored in local mode. Same routing
     * rule as streaming.
     */
    const a = await sendMessage(ANTHROPIC, 'claude-haiku', 'sys', [], 100)
    expect(a).toBe('anthropic-result')
    expect((anthropicMocks.sendMessage.mock.calls[0] as unknown[])[1]).toBe('claude-haiku')

    const l = await sendMessage(LOCAL, 'claude-haiku', 'sys', [], 100)
    expect(l).toBe('local-result')
    expect((localMocks.sendMessage.mock.calls[0] as unknown[])[1]).toBe('gemma')
  })

  it('sendMessage throws NO_MODEL_CONFIGURED synchronously in local mode without a model', async () => {
    /**
     * Non-streaming path: the dispatcher throws (rather than reporting
     * via onError) because the caller is awaiting a string. Throwing
     * matches what entryProcessor's existing catch blocks already handle
     * — the loop logs and skips that entry.
     */
    await expect(sendMessage({ ...LOCAL, localModel: '' }, 'irrelevant', 'sys', [], 100))
      .rejects.toMatchObject({ code: 'NO_MODEL_CONFIGURED' })
  })

  it('sendMessageStreaming routes by provider', async () => {
    /**
     * profileGenerator uses this for Opus full profile generation in
     * Anthropic mode. In local mode it routes to the same SSE-streaming
     * code path but resolves with the full string at the end.
     */
    expect(await sendMessageStreaming(ANTHROPIC, 'opus', 'sys', [], 1000, () => {})).toBe('anthropic-streamed')
    expect(await sendMessageStreaming(LOCAL, 'opus', 'sys', [], 1000, () => {})).toBe('local-streamed')
    expect((localMocks.sendMessageStreaming.mock.calls[0] as unknown[])[1]).toBe('gemma')
  })
})

describe('fetchModels routing', () => {
  it('returns the anthropic model list in anthropic mode and the local list in local mode', async () => {
    /**
     * The settings UI uses fetchModels to populate either the Anthropic
     * dropdown (via useAnthropicModels) or the local autocomplete (via
     * useLocalModels). The dispatcher does the routing so both UIs can
     * call the same dispatcher without knowing which provider is active.
     */
    const a = await fetchModels(ANTHROPIC)
    expect(a).toEqual([{ id: 'claude-haiku', displayName: 'Haiku' }])
    expect(anthropicMocks.fetchModels).toHaveBeenCalledWith('sk-x')

    const l = await fetchModels(LOCAL)
    expect(l).toEqual([{ id: 'gemma', displayName: 'gemma' }])
    expect(localMocks.fetchModels).toHaveBeenCalledWith('http://localhost:1234/v1')
  })
})

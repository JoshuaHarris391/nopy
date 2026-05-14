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
const { anthropicMocks, localMocks, openaiMocks } = vi.hoisted(() => ({
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
  openaiMocks: {
    streamChatResponse: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => 'openai-result'),
    sendMessageStreaming: vi.fn(async () => 'openai-streamed'),
    fetchModels: vi.fn(async () => [{ id: 'gpt-4o-mini', displayName: 'gpt-4o-mini' }]),
  },
}))

vi.mock('../../services/anthropic', () => anthropicMocks)
vi.mock('../../services/localServer', () => localMocks)
vi.mock('../../services/openai', () => openaiMocks)

import { streamChatResponse, sendMessage, sendMessageStreaming, fetchModels, LlmError } from '../../services/llm'

const ANTHROPIC: LlmConfig = {
  provider: 'anthropic',
  apiKey: 'sk-x',
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: '',
  openaiApiKey: '',
  openaiModel: '',
}
const LOCAL: LlmConfig = {
  provider: 'local',
  apiKey: '',
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: 'gemma',
  openaiApiKey: '',
  openaiModel: '',
}
const OPENAI: LlmConfig = {
  provider: 'openai',
  apiKey: '',
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: '',
  openaiApiKey: 'sk-openai-x',
  openaiModel: 'gpt-4o-mini',
}

beforeEach(() => {
  for (const fn of Object.values(anthropicMocks)) fn.mockClear()
  for (const fn of Object.values(localMocks)) fn.mockClear()
  for (const fn of Object.values(openaiMocks)) fn.mockClear()
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

  it('routes to openai when provider is "openai" and overrides requestedModel with config.openaiModel', async () => {
    /**
     * Same override rule as Local: in OpenAI mode the dispatcher MUST
     * ignore the caller's `requestedModel` (e.g. ChatView's preferredModel
     * "claude-sonnet-4-5" or entryProcessor's HAIKU_MODEL) because those
     * Anthropic-shaped IDs aren't valid OpenAI models. Use config.openaiModel
     * instead so OpenAI mode behaves consistently regardless of which
     * caller invoked the dispatcher.
     */
    await streamChatResponse(OPENAI, 'claude-sonnet', 'sys', [{ role: 'user', content: 'hi' }], 100, () => {}, () => {}, () => {})
    expect(openaiMocks.streamChatResponse).toHaveBeenCalledTimes(1)
    expect(anthropicMocks.streamChatResponse).not.toHaveBeenCalled()
    expect(localMocks.streamChatResponse).not.toHaveBeenCalled()
    const args = openaiMocks.streamChatResponse.mock.calls[0] as unknown[]
    expect(args[0]).toBe('sk-openai-x')   // openaiApiKey
    expect(args[1]).toBe('gpt-4o-mini')   // openaiModel, NOT 'claude-sonnet'
  })

  it('reports NO_MODEL_CONFIGURED via onError when openai + empty openaiModel', async () => {
    /**
     * The user toggled to OpenAI mode and entered an API key but hasn't
     * picked a model yet. The dispatcher must fail fast with the same
     * stable error code as the Local equivalent so the UI can render the
     * existing error copy without a provider-specific branch.
     */
    const errors: unknown[] = []
    await streamChatResponse(
      { ...OPENAI, openaiModel: '' }, 'irrelevant', 'sys', [], 100,
      () => {}, () => {}, (e) => errors.push(e),
    )
    expect(openaiMocks.streamChatResponse).not.toHaveBeenCalled()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(LlmError)
    expect((errors[0] as LlmError).code).toBe('NO_MODEL_CONFIGURED')
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
  it('sendMessage routes by provider and overrides model in local + openai modes', async () => {
    /**
     * entryProcessor.processEntry calls sendMessage with HAIKU_MODEL —
     * meaningful in Anthropic mode, ignored in local + openai modes. Same
     * routing rule as streaming. The OpenAI branch overrides because
     * Anthropic-shaped IDs aren't valid OpenAI model names.
     */
    const a = await sendMessage(ANTHROPIC, 'claude-haiku', 'sys', [], 100)
    expect(a).toBe('anthropic-result')
    expect((anthropicMocks.sendMessage.mock.calls[0] as unknown[])[1]).toBe('claude-haiku')

    const l = await sendMessage(LOCAL, 'claude-haiku', 'sys', [], 100)
    expect(l).toBe('local-result')
    expect((localMocks.sendMessage.mock.calls[0] as unknown[])[1]).toBe('gemma')

    const o = await sendMessage(OPENAI, 'claude-haiku', 'sys', [], 100)
    expect(o).toBe('openai-result')
    expect((openaiMocks.sendMessage.mock.calls[0] as unknown[])[0]).toBe('sk-openai-x')
    expect((openaiMocks.sendMessage.mock.calls[0] as unknown[])[1]).toBe('gpt-4o-mini')
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
  it('returns the anthropic model list in anthropic mode, the local list in local mode, and the openai list in openai mode', async () => {
    /**
     * The settings UI uses fetchModels to populate either the Anthropic
     * dropdown (via useAnthropicModels), the local autocomplete (via
     * useLocalModels), or the OpenAI dropdown (via useOpenaiModels). The
     * dispatcher does the routing so all three UIs can call the same
     * dispatcher without knowing which provider is active.
     */
    const a = await fetchModels(ANTHROPIC)
    expect(a).toEqual([{ id: 'claude-haiku', displayName: 'Haiku' }])
    expect(anthropicMocks.fetchModels).toHaveBeenCalledWith('sk-x')

    const l = await fetchModels(LOCAL)
    expect(l).toEqual([{ id: 'gemma', displayName: 'gemma' }])
    expect(localMocks.fetchModels).toHaveBeenCalledWith('http://localhost:1234/v1')

    const o = await fetchModels(OPENAI)
    expect(o).toEqual([{ id: 'gpt-4o-mini', displayName: 'gpt-4o-mini' }])
    expect(openaiMocks.fetchModels).toHaveBeenCalledWith('sk-openai-x')
  })
})

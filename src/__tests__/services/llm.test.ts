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
    fetchModels: vi.fn(async () => [{ id: 'claude-sonnet', displayName: 'Sonnet' }]),
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
    fetchModels: vi.fn(async () => [{ id: 'gpt-4o', displayName: 'gpt-4o' }]),
  },
}))

vi.mock('../../services/anthropic', () => anthropicMocks)
vi.mock('../../services/localServer', () => localMocks)
vi.mock('../../services/openai', () => openaiMocks)

import { streamChatResponse, sendMessage, sendMessageStreaming, fetchModels, resolveModel, LlmError } from '../../services/llm'

const ANTHROPIC: LlmConfig = {
  provider: 'anthropic',
  apiKey: 'sk-x',
  anthropicMainModel: 'claude-sonnet',
  anthropicLightweightModel: 'claude-haiku',
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: '',
  localLightweightModel: '',
  openaiApiKey: '',
  openaiModel: '',
  openaiLightweightModel: '',
}
const LOCAL: LlmConfig = {
  provider: 'local',
  apiKey: '',
  anthropicMainModel: '',
  anthropicLightweightModel: '',
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: 'gemma',
  localLightweightModel: 'gemma-mini',
  openaiApiKey: '',
  openaiModel: '',
  openaiLightweightModel: '',
}
const OPENAI: LlmConfig = {
  provider: 'openai',
  apiKey: '',
  anthropicMainModel: '',
  anthropicLightweightModel: '',
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: '',
  localLightweightModel: '',
  openaiApiKey: 'sk-openai-x',
  openaiModel: 'gpt-4o',
  openaiLightweightModel: 'gpt-4o-mini',
}

beforeEach(() => {
  for (const fn of Object.values(anthropicMocks)) fn.mockClear()
  for (const fn of Object.values(localMocks)) fn.mockClear()
  for (const fn of Object.values(openaiMocks)) fn.mockClear()
})

describe('resolveModel role mapping', () => {
  it('returns the right slot for each (provider, role) pair', () => {
    /**
     * The dispatcher's core mapping: callers pass a *role* ('main' or
     * 'lightweight'), the dispatcher reads the matching per-provider slot
     * from LlmConfig. This is the contract every public function relies
     * on; if it drifts, chat will silently use the wrong model.
     */
    expect(resolveModel(ANTHROPIC, 'main')).toBe('claude-sonnet')
    expect(resolveModel(ANTHROPIC, 'lightweight')).toBe('claude-haiku')
    expect(resolveModel(LOCAL, 'main')).toBe('gemma')
    expect(resolveModel(LOCAL, 'lightweight')).toBe('gemma-mini')
    expect(resolveModel(OPENAI, 'main')).toBe('gpt-4o')
    expect(resolveModel(OPENAI, 'lightweight')).toBe('gpt-4o-mini')
  })

  it('falls back to the main slot when openai/local lightweight slot is blank', () => {
    /**
     * The "I only run one model" escape hatch. LM Studio loads one model
     * at a time, and OpenAI users may not want to bother configuring a
     * cheap secondary. A blank lightweight slot must transparently reuse
     * the main slot — otherwise zero-config local setups would throw
     * NO_MODEL_CONFIGURED for entry indexing and chat-title generation.
     */
    expect(resolveModel({ ...LOCAL, localLightweightModel: '' }, 'lightweight')).toBe('gemma')
    expect(resolveModel({ ...OPENAI, openaiLightweightModel: '' }, 'lightweight')).toBe('gpt-4o')
  })

  it('throws NO_MODEL_CONFIGURED when the main slot is empty (no fallback possible)', () => {
    /**
     * The fallback only rescues lightweight requests — if the *main* slot
     * itself is blank, there's nothing to fall back to. We surface the
     * same error code the UI already renders ("Pick a local model in
     * Settings before sending a message.") so the existing error copy
     * still applies.
     */
    expect(() => resolveModel({ ...LOCAL, localModel: '' }, 'main'))
      .toThrow(expect.objectContaining({ code: 'NO_MODEL_CONFIGURED' }))
    expect(() => resolveModel({ ...OPENAI, openaiModel: '' }, 'main'))
      .toThrow(expect.objectContaining({ code: 'NO_MODEL_CONFIGURED' }))
  })

  it('throws NO_MODEL_CONFIGURED in local lightweight when *both* slots are blank', () => {
    /**
     * Lightweight falls back to main — but if main is also blank there's
     * no recovery. This is the only path where the lightweight role can
     * surface NO_MODEL_CONFIGURED for local/openai.
     */
    expect(() => resolveModel({ ...LOCAL, localModel: '', localLightweightModel: '' }, 'lightweight'))
      .toThrow(expect.objectContaining({ code: 'NO_MODEL_CONFIGURED' }))
  })
})

describe('streamChatResponse routing', () => {
  it('routes to anthropic with the main slot for role="main"', async () => {
    /**
     * Anthropic mode is the default and the path every existing user is
     * on. ChatView sends role="main"; the dispatcher must look up
     * anthropicMainModel from LlmConfig and forward it to the provider.
     */
    await streamChatResponse(ANTHROPIC, 'main', 'sys', [{ role: 'user', content: 'hi' }], 100, () => {}, () => {}, () => {})
    expect(anthropicMocks.streamChatResponse).toHaveBeenCalledTimes(1)
    expect(localMocks.streamChatResponse).not.toHaveBeenCalled()
    const args = anthropicMocks.streamChatResponse.mock.calls[0] as unknown[]
    expect(args[0]).toBe('sk-x')           // apiKey
    expect(args[1]).toBe('claude-sonnet')  // resolved main slot
  })

  it('routes to localServer with config.localModel for role="main"', async () => {
    /**
     * In local mode the dispatcher resolves role="main" to config.localModel.
     * LM Studio loads one model at a time, so the resolved id has to match
     * the loaded model name exactly — otherwise LM Studio returns 404.
     */
    await streamChatResponse(LOCAL, 'main', 'sys', [{ role: 'user', content: 'hi' }], 100, () => {}, () => {}, () => {})
    expect(localMocks.streamChatResponse).toHaveBeenCalledTimes(1)
    expect(anthropicMocks.streamChatResponse).not.toHaveBeenCalled()
    const args = localMocks.streamChatResponse.mock.calls[0] as unknown[]
    expect(args[0]).toBe('http://localhost:1234/v1') // baseUrl
    expect(args[1]).toBe('gemma')                    // resolved main slot
  })

  it('routes to openai with config.openaiModel for role="main"', async () => {
    /**
     * OpenAI mode mirrors Anthropic mode — the dispatcher reads the
     * per-provider main slot and forwards it. Catches regressions where
     * the OpenAI branch reads from the wrong slot.
     */
    await streamChatResponse(OPENAI, 'main', 'sys', [{ role: 'user', content: 'hi' }], 100, () => {}, () => {}, () => {})
    expect(openaiMocks.streamChatResponse).toHaveBeenCalledTimes(1)
    expect(anthropicMocks.streamChatResponse).not.toHaveBeenCalled()
    expect(localMocks.streamChatResponse).not.toHaveBeenCalled()
    const args = openaiMocks.streamChatResponse.mock.calls[0] as unknown[]
    expect(args[0]).toBe('sk-openai-x')   // openaiApiKey
    expect(args[1]).toBe('gpt-4o')        // resolved main slot
  })

  it('reports NO_MODEL_CONFIGURED via onError when openai + empty openaiModel', async () => {
    /**
     * The user toggled to OpenAI mode and entered an API key but hasn't
     * picked a main model yet. The dispatcher must fail fast with the same
     * stable error code as the Local equivalent so the UI can render the
     * existing error copy without a provider-specific branch.
     */
    const errors: unknown[] = []
    await streamChatResponse(
      { ...OPENAI, openaiModel: '' }, 'main', 'sys', [], 100,
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
     * is a 400 error. Reporting via onError (rather than throwing) keeps
     * the streaming caller's error handling consistent with how it deals
     * with mid-stream failures.
     */
    const errors: unknown[] = []
    await streamChatResponse(
      { ...LOCAL, localModel: '' }, 'main', 'sys', [], 100,
      () => {}, () => {}, (e) => errors.push(e),
    )
    expect(localMocks.streamChatResponse).not.toHaveBeenCalled()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(LlmError)
    expect((errors[0] as LlmError).code).toBe('NO_MODEL_CONFIGURED')
  })
})

describe('sendMessage / sendMessageStreaming routing', () => {
  it('sendMessage resolves the lightweight slot per provider', async () => {
    /**
     * entryProcessor.processEntry passes role="lightweight" — Anthropic
     * resolves to the configured Haiku slot, local resolves to its own
     * lightweight slot, and OpenAI resolves to gpt-4o-mini. Same routing
     * rule as streaming.
     */
    const a = await sendMessage(ANTHROPIC, 'lightweight', 'sys', [], 100)
    expect(a).toBe('anthropic-result')
    expect((anthropicMocks.sendMessage.mock.calls[0] as unknown[])[1]).toBe('claude-haiku')

    const l = await sendMessage(LOCAL, 'lightweight', 'sys', [], 100)
    expect(l).toBe('local-result')
    expect((localMocks.sendMessage.mock.calls[0] as unknown[])[1]).toBe('gemma-mini')

    const o = await sendMessage(OPENAI, 'lightweight', 'sys', [], 100)
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
    await expect(sendMessage({ ...LOCAL, localModel: '', localLightweightModel: '' }, 'main', 'sys', [], 100))
      .rejects.toMatchObject({ code: 'NO_MODEL_CONFIGURED' })
  })

  it('sendMessageStreaming routes by provider for role="main"', async () => {
    /**
     * profileGenerator uses this for full-profile generation (role="main").
     * In local mode it routes to the same SSE-streaming code path but
     * resolves with the full string at the end.
     */
    expect(await sendMessageStreaming(ANTHROPIC, 'main', 'sys', [], 1000, () => {})).toBe('anthropic-streamed')
    expect(await sendMessageStreaming(LOCAL, 'main', 'sys', [], 1000, () => {})).toBe('local-streamed')
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
    expect(a).toEqual([{ id: 'claude-sonnet', displayName: 'Sonnet' }])
    expect(anthropicMocks.fetchModels).toHaveBeenCalledWith('sk-x')

    const l = await fetchModels(LOCAL)
    expect(l).toEqual([{ id: 'gemma', displayName: 'gemma' }])
    expect(localMocks.fetchModels).toHaveBeenCalledWith('http://localhost:1234/v1')

    const o = await fetchModels(OPENAI)
    expect(o).toEqual([{ id: 'gpt-4o', displayName: 'gpt-4o' }])
    expect(openaiMocks.fetchModels).toHaveBeenCalledWith('sk-openai-x')
  })
})

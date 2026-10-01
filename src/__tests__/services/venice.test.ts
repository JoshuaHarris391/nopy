import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Mock of the OpenAI SDK default export — Venice is OpenAI-compatible, so
 * `services/venice.ts` talks to the same SDK shape as `services/openai.ts`
 * (a class with `chat.completions.create` and `models.list`). Tests must
 * control both without touching the network:
 *   - `mockState.instances` — every constructor call so `getClient` cache,
 *     `baseURL`, and `dangerouslyAllowBrowser` can be asserted.
 *   - `mockState.createImpl` / `mockState.listImpl` — `vi.fn`s for the
 *     chat-completions and model-list endpoints. A streaming call is
 *     simulated by resolving `createImpl` with an async iterable.
 *
 * `vi.hoisted` is mandatory: `vi.mock` factories run before any top-level
 * variable is initialized.
 */
const { OpenAIMock, mockState } = vi.hoisted(() => {
  type CtorArgs = { apiKey: string; baseURL?: string; dangerouslyAllowBrowser?: boolean }
  const state = {
    instances: [] as { ctorArgs: CtorArgs; createCalls: unknown[][]; listCalls: unknown[][] }[],
    createImpl: vi.fn(),
    listImpl: vi.fn(),
    reset() {
      state.instances = []
      state.createImpl = vi.fn()
      state.listImpl = vi.fn()
    },
  }

  class OpenAIMock {
    chat: { completions: { create: ReturnType<typeof vi.fn> } }
    models: { list: ReturnType<typeof vi.fn> }
    constructor(ctorArgs: CtorArgs) {
      const record = { ctorArgs, createCalls: [] as unknown[][], listCalls: [] as unknown[][] }
      state.instances.push(record)
      this.chat = {
        completions: {
          create: vi.fn((...args: unknown[]) => {
            record.createCalls.push(args)
            return state.createImpl(...args)
          }),
        },
      }
      this.models = {
        list: vi.fn((...args: unknown[]) => {
          record.listCalls.push(args)
          return state.listImpl(...args)
        }),
      }
    }
  }

  return { OpenAIMock, mockState: state }
})

vi.mock('openai', () => ({ default: OpenAIMock }))

async function* streamOf(chunks: unknown[]) {
  for (const c of chunks) yield c
}

const delta = (content: string) => ({ choices: [{ delta: { content } }] })

type VeniceModule = typeof import('../../services/venice')
let mod: VeniceModule

beforeEach(async () => {
  // Resets the module-level `clientInstance` / `currentApiKey` singletons.
  vi.resetModules()
  mockState.reset()
  mod = await import('../../services/venice')
})

describe('getClient', () => {
  it('caches one client per API key, pins the Venice base URL, and passes dangerouslyAllowBrowser', () => {
    /**
     * Two calls with the same key must reuse the instance; a new key must
     * allocate a fresh one. The `baseURL` is what makes Venice distinct from
     * the OpenAI provider, and `dangerouslyAllowBrowser` is required for the
     * SDK to run in the Tauri webview / jsdom at all.
     */
    const a = mod.getClient('key-1')
    const b = mod.getClient('key-1')
    const c = mod.getClient('key-2')

    expect(a).toBe(b)
    expect(c).not.toBe(a)
    expect(mockState.instances).toHaveLength(2)
    expect(mockState.instances[0].ctorArgs).toEqual({
      apiKey: 'key-1',
      baseURL: 'https://api.venice.ai/api/v1',
      dangerouslyAllowBrowser: true,
    })
  })
})

describe('streamChatResponse', () => {
  it('sends the system prompt as the leading message with max_tokens and stream:true', async () => {
    /**
     * Venice (like OpenAI) takes `system` as a message, not a top-level field.
     * `max_tokens` — not OpenAI's newer `max_completion_tokens` — is what
     * Venice's compat layer accepts, so a refactor to the newer param would
     * silently break every Venice request.
     */
    mockState.createImpl = vi.fn(async () => streamOf([]))
    await mod.streamChatResponse(
      'key', 'claude-opus-4-8', 'sys', [{ role: 'user', content: 'hi' }], 512,
      () => {}, () => {}, () => {},
    )

    const body = mockState.instances[0].createCalls[0][0] as Record<string, unknown>
    expect(body).toEqual({
      model: 'claude-opus-4-8',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      max_tokens: 512,
      stream: true,
    })
  })

  it('calls onChunk with cumulative text then onComplete once', async () => {
    /**
     * The chat store overwrites the streaming message with whatever onChunk
     * passes, so it must be the *accumulated* string, not the delta.
     */
    mockState.createImpl = vi.fn(async () => streamOf([delta('Hel'), delta('lo')]))
    const chunks: string[] = []
    const completes: string[] = []
    await mod.streamChatResponse('k', 'm', 's', [], 1, (c) => chunks.push(c), (c) => completes.push(c), () => {})

    expect(chunks).toEqual(['Hel', 'Hello'])
    expect(completes).toEqual(['Hello'])
  })

  it('routes stream errors to onError as an LlmError, never onComplete', async () => {
    /**
     * A mid-stream auth failure must surface as an LlmError with a stable code
     * so ChatView can render the curated copy.
     */
    mockState.createImpl = vi.fn(async () => { throw Object.assign(new Error('bad key'), { status: 401 }) })
    const onComplete = vi.fn()
    const onError = vi.fn()
    await mod.streamChatResponse('k', 'm', 's', [], 1, () => {}, onComplete, onError)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatchObject({ name: 'LlmError', code: 'INVALID_API_KEY' })
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('sendMessage', () => {
  it('returns the message content and defaults max_tokens to 500', async () => {
    mockState.createImpl = vi.fn(async () => ({ choices: [{ message: { content: 'summary' }, finish_reason: 'stop' }] }))
    const result = await mod.sendMessage('k', 'm', 's', [{ role: 'user', content: 'q' }])

    expect(result).toBe('summary')
    const body = mockState.instances[0].createCalls[0][0] as Record<string, unknown>
    expect(body.max_tokens).toBe(500)
  })

  it('forwards an AbortSignal as the second SDK argument', async () => {
    /**
     * entryProcessor's "stop" button aborts an in-flight request — dropping
     * the signal makes abort a no-op.
     */
    mockState.createImpl = vi.fn(async () => ({ choices: [{ message: { content: '' } }] }))
    const controller = new AbortController()
    await mod.sendMessage('k', 'm', 's', [], 100, controller.signal)

    const opts = mockState.instances[0].createCalls[0][1] as { signal?: AbortSignal }
    expect(opts.signal).toBe(controller.signal)
  })
})

describe('sendMessageStreaming', () => {
  it('reports cumulative char count via onProgress and resolves with the final text', async () => {
    mockState.createImpl = vi.fn(async () => streamOf([delta('ab'), delta('cde')]))
    const progress: number[] = []
    const result = await mod.sendMessageStreaming('k', 'm', 's', [], 100, (n) => progress.push(n))

    expect(progress).toEqual([2, 5])
    expect(result).toBe('abcde')
  })
})

describe('fetchModels', () => {
  it('drops non-text models, merges the curated list, and sorts by id', async () => {
    /**
     * Venice returns text, image, and embedding models together. The dropdown
     * must show only chat-capable ids, always include the curated support
     * matrix even when the live list omits it, and stay deterministically
     * sorted. This pins all three behaviours.
     */
    mockState.listImpl = vi.fn(async () => ({
      data: [
        { id: 'claude-opus-4-8', type: 'text', model_spec: { availableContextTokens: 1_000_000 } },
        { id: 'image-model', type: 'image' },
        { id: 'embed-model', type: 'embedding' },
      ],
    }))
    const result = await mod.fetchModels('k')

    expect(result.map((m) => m.id)).toEqual([
      'claude-opus-4-8',
      'deepseek-v4-1-flash',
      'deepseek-v4-pro-0813',
      'openai-gpt-6-luna',
    ])
    // Venice reports its own usable window at `model_spec.availableContextTokens`
    // — the number the Context budget bar needs (LiteLLM doesn't carry it).
    expect(result.find((m) => m.id === 'claude-opus-4-8')?.contextTokens).toBe(1_000_000)
    // Curated ids absent from the live response carry no provider window.
    expect(result.find((m) => m.id === 'deepseek-v4-1-flash')?.contextTokens).toBeUndefined()
  })

  it('keeps entries whose type is missing (fail open rather than hide a model)', async () => {
    /**
     * If Venice's `/models` response shape changes and `type` disappears, we
     * must not silently hide every model — unknown-type entries are kept.
     */
    mockState.listImpl = vi.fn(async () => ({ data: [{ id: 'unspecified-model' }] }))
    const result = await mod.fetchModels('k')

    expect(result.map((m) => m.id)).toContain('unspecified-model')
  })
})

describe('toLlmError mapping', () => {
  it('maps 401 → INVALID_API_KEY, 429 → RATE_LIMITED, and unknown → UNKNOWN', async () => {
    /**
     * The dispatcher contract: every provider surfaces failures as LlmError
     * with a stable code so the UI can look up curated copy. The 401 copy is
     * Venice-specific ("Your Venice API key isn't valid…").
     */
    mockState.createImpl = vi.fn(async () => { throw Object.assign(new Error('401'), { status: 401 }) })
    await expect(mod.sendMessage('bad', 'm', 's', [], 100)).rejects.toMatchObject({
      name: 'LlmError',
      code: 'INVALID_API_KEY',
    })

    mockState.createImpl = vi.fn(async () => { throw Object.assign(new Error('429'), { status: 429 }) })
    await expect(mod.sendMessage('k', 'm', 's', [], 100)).rejects.toMatchObject({
      name: 'LlmError',
      code: 'RATE_LIMITED',
    })

    mockState.createImpl = vi.fn(async () => { throw new Error('socket hang up') })
    await expect(mod.sendMessage('k', 'm', 's', [], 100)).rejects.toMatchObject({
      name: 'LlmError',
      code: 'UNKNOWN',
      message: 'socket hang up',
    })
  })
})

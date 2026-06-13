import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Mock of the Anthropic SDK default export. The real class wraps a fetch
 * client and an event-emitter stream; tests must control both without
 * touching the network. We expose:
 *   - `mockState.instances` — every constructor call so `getClient` cache /
 *     `dangerouslyAllowBrowser` can be asserted.
 *   - `mockState.installFakeStream()` — pre-loads the next `messages.stream`
 *     call with a driver that fires `text` / `finalMessage` / `error` events.
 *   - `mockState.createImpl` / `mockState.listImpl` — `vi.fn`s for the
 *     non-streaming endpoints.
 *
 * `vi.hoisted` is mandatory: `vi.mock` factories run before any top-level
 * variable is initialized, so referencing a regular `const` inside the
 * factory throws "Cannot access 'X' before initialization".
 */
const { AnthropicMock, mockState } = vi.hoisted(() => {
  type EventName = 'text' | 'finalMessage' | 'error'
  type FakeStream = {
    on: (event: EventName, handler: (arg: unknown) => void) => FakeStream
    finalMessage: () => Promise<unknown>
    emitText: (text: string) => void
    emitFinal: (msg?: unknown) => void
    emitError: (err: unknown) => void
  }

  function createFakeStream(): FakeStream {
    const handlers: Record<EventName, ((arg: unknown) => void)[]> = {
      text: [],
      finalMessage: [],
      error: [],
    }
    let resolveFinal: ((v: unknown) => void) | null = null
    let rejectFinal: ((e: unknown) => void) | null = null
    const finalPromise = new Promise<unknown>((res, rej) => {
      resolveFinal = res
      rejectFinal = rej
    })
    // Swallow rejections that nobody awaits — error tests deliberately don't
    // await `finalMessage()`, and an unhandled rejection would fail the run.
    finalPromise.catch(() => {})

    const stream: FakeStream = {
      on(event, handler) {
        handlers[event].push(handler)
        return stream
      },
      finalMessage: () => finalPromise,
      emitText(text) {
        for (const h of handlers.text) h(text)
      },
      emitFinal(msg) {
        for (const h of handlers.finalMessage) h(msg)
        resolveFinal?.(msg)
      },
      emitError(err) {
        for (const h of handlers.error) h(err)
        rejectFinal?.(err)
      },
    }
    return stream
  }

  type CtorArgs = { apiKey: string; dangerouslyAllowBrowser?: boolean }
  const state = {
    instances: [] as { ctorArgs: CtorArgs; streamCalls: unknown[][]; createCalls: unknown[][]; listCalls: unknown[][] }[],
    nextStream: null as FakeStream | null,
    createImpl: vi.fn(),
    listImpl: vi.fn(),
    installFakeStream(): FakeStream {
      const fake = createFakeStream()
      state.nextStream = fake
      return fake
    },
    reset() {
      state.instances = []
      state.nextStream = null
      state.createImpl = vi.fn()
      state.listImpl = vi.fn()
    },
  }

  class AnthropicMock {
    messages: {
      stream: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
    }
    models: { list: ReturnType<typeof vi.fn> }
    constructor(ctorArgs: CtorArgs) {
      const record = { ctorArgs, streamCalls: [] as unknown[][], createCalls: [] as unknown[][], listCalls: [] as unknown[][] }
      state.instances.push(record)
      this.messages = {
        stream: vi.fn((...args: unknown[]) => {
          record.streamCalls.push(args)
          const s = state.nextStream
          if (!s) throw new Error('No fake stream installed for messages.stream() call')
          state.nextStream = null
          return s
        }),
        create: vi.fn((...args: unknown[]) => {
          record.createCalls.push(args)
          return state.createImpl(...args)
        }),
      }
      this.models = {
        list: vi.fn((...args: unknown[]) => {
          record.listCalls.push(args)
          return state.listImpl(...args)
        }),
      }
    }
  }

  return { AnthropicMock, mockState: state }
})

vi.mock('@anthropic-ai/sdk', () => ({ default: AnthropicMock }))

type AnthropicModule = typeof import('../../services/anthropic')
let mod: AnthropicModule

beforeEach(async () => {
  // Resets the module-level `clientInstance` / `currentApiKey` singletons
  // inside services/anthropic so each test gets a fresh client cache.
  vi.resetModules()
  mockState.reset()
  mod = await import('../../services/anthropic')
})

describe('getClient', () => {
  it('caches one client per API key and always passes dangerouslyAllowBrowser', () => {
    /**
     * Two calls with the same key must return the same instance (cache hit);
     * a third call with a different key must allocate a new instance. The
     * `dangerouslyAllowBrowser: true` flag is a hard requirement — the SDK
     * refuses to run in jsdom/browsers without it, so a refactor that drops
     * it would break the entire app silently in development.
     */
    const a = mod.getClient('key-1')
    const b = mod.getClient('key-1')
    const c = mod.getClient('key-2')

    expect(a).toBe(b)
    expect(c).not.toBe(a)
    expect(mockState.instances).toHaveLength(2)
    expect(mockState.instances[0].ctorArgs).toEqual({ apiKey: 'key-1', dangerouslyAllowBrowser: true })
    expect(mockState.instances[1].ctorArgs).toEqual({ apiKey: 'key-2', dangerouslyAllowBrowser: true })
  })
})

describe('streamChatResponse', () => {
  it('forwards model, system, messages, max_tokens to the SDK unchanged', async () => {
    /**
     * The whole point of this wrapper is to be a thin pass-through. If the
     * upcoming multi-provider refactor reshapes the request body, this test
     * fails immediately — surfacing the regression before it reaches a real
     * Anthropic API call in dev.
     */
    const fake = mockState.installFakeStream()
    const messages = [{ role: 'user' as const, content: 'hi' }]
    const promise = mod.streamChatResponse(
      'key',
      'claude-sonnet-4-5-20250514',
      'system prompt',
      messages,
      512,
      () => {},
      () => {},
      () => {},
    )
    await promise
    fake.emitFinal()

    const streamArgs = mockState.instances[0].streamCalls[0][0] as Record<string, unknown>
    expect(streamArgs).toEqual({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 512,
      system: 'system prompt',
      messages,
    })
  })

  it('calls onChunk with cumulative text in arrival order, then onComplete once with the final text', async () => {
    /**
     * The provider contract that the chat store relies on: each `onChunk`
     * receives the *full* accumulated string so far (not the delta). This
     * is what `updateStreamingMessage(content)` expects — it overwrites the
     * last message's content rather than appending. If the new local
     * provider passes deltas instead, every other character would be lost.
     * onComplete must fire exactly once with the full text.
     */
    const fake = mockState.installFakeStream()
    const chunks: string[] = []
    const completes: string[] = []
    const promise = mod.streamChatResponse(
      'k', 'm', 's', [], 1,
      (c) => chunks.push(c),
      (c) => completes.push(c),
      () => {},
    )
    await promise

    fake.emitText('Hel')
    fake.emitText('lo')
    fake.emitText(' world')
    fake.emitFinal()

    expect(chunks).toEqual(['Hel', 'Hello', 'Hello world'])
    expect(completes).toEqual(['Hello world'])
  })

  it('routes stream errors to onError, never onComplete, and wraps non-Error values in Error', async () => {
    /**
     * The chat UI can only render `error.message`. The wrapper must convert
     * any thrown shape (string, number, plain object) into a real Error so
     * the UI doesn't render `[object Object]` or crash on a missing
     * `.message`. onComplete must NOT be called after an error — that would
     * leave the streaming message in a "happily completed but empty" state.
     */
    const fake = mockState.installFakeStream()
    const onComplete = vi.fn()
    const onError = vi.fn()
    const promise = mod.streamChatResponse('k', 'm', 's', [], 1, () => {}, onComplete, onError)
    await promise

    // Non-Error rejection — the wrapper must coerce.
    fake.emitError('boom')

    expect(onError).toHaveBeenCalledTimes(1)
    const received = onError.mock.calls[0][0]
    expect(received).toBeInstanceOf(Error)
    expect((received as Error).message).toBe('boom')
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('sendMessage', () => {
  it('returns the first text block and defaults max_tokens to 500', async () => {
    /**
     * `sendMessage` is what `entryProcessor` uses to summarize/tag entries.
     * It picks the first content block and reads `.text` only when
     * `type === 'text'`; anything else returns `''`. The default 500-token
     * cap is documented as a "small task, fast response" budget — increasing
     * it silently would inflate cost on every entry import.
     */
    mockState.createImpl = vi.fn(async () => ({
      content: [{ type: 'text', text: 'summary text' }],
      stop_reason: 'end_turn',
    }))
    const result = await mod.sendMessage('k', 'm', 's', [{ role: 'user', content: 'q' }])

    expect(result).toBe('summary text')
    const createArgs = mockState.instances[0].createCalls[0][0] as Record<string, unknown>
    expect(createArgs.max_tokens).toBe(500)
  })

  it('returns empty string when the first block is not text', async () => {
    /**
     * Defensive contract for `entryProcessor` callers — a tool-use block as
     * the first response should not blow up the import flow. The wrapper
     * returns `''` and lets the caller decide whether that's a failure.
     */
    mockState.createImpl = vi.fn(async () => ({
      content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }],
      stop_reason: 'tool_use',
    }))
    const result = await mod.sendMessage('k', 'm', 's', [], 100)
    expect(result).toBe('')
  })

  it('forwards an AbortSignal as the second SDK argument', async () => {
    /**
     * `entryProcessor`'s "stop force update" button works by aborting an in
     * flight request. If the wrapper drops the signal, abort becomes a
     * no-op and the user can't actually cancel processing.
     */
    mockState.createImpl = vi.fn(async () => ({ content: [{ type: 'text', text: '' }], stop_reason: 'end_turn' }))
    const controller = new AbortController()
    await mod.sendMessage('k', 'm', 's', [], 100, controller.signal)

    const opts = mockState.instances[0].createCalls[0][1] as { signal?: AbortSignal }
    expect(opts.signal).toBe(controller.signal)
  })
})

describe('sendMessageStreaming', () => {
  it('reports cumulative char count via onProgress and resolves with the final text', async () => {
    /**
     * Used during entry indexing where we want a progress bar but still want
     * the full text at the end. `onProgress` must report cumulative chars
     * (not deltas) so the UI can render `received / expected` directly.
     */
    const fake = mockState.installFakeStream()
    const progress: number[] = []
    const promise = mod.sendMessageStreaming('k', 'm', 's', [], 100, (n) => progress.push(n))

    // Allow the function body to register handlers before emitting.
    await Promise.resolve()
    fake.emitText('ab')
    fake.emitText('cde')
    fake.emitFinal()

    const result = await promise
    expect(progress).toEqual([2, 5])
    expect(result).toBe('abcde')
  })
})

describe('fetchModels', () => {
  it('filters non-claude ids, sorts by displayName, falls back to id, and requests limit:100', async () => {
    /**
     * Settings UI feeds these into a `<select>` ordered by displayName.
     * Non-claude models (e.g. embedding endpoints) must not leak in or the
     * UI shows un-runnable options. The `display_name ?? id` fallback
     * matters because the API occasionally returns null for newer models.
     * `limit: 100` is the documented page size — silently dropping it
     * would cap the dropdown at the API default.
     */
    mockState.listImpl = vi.fn(async () => ({
      data: [
        { id: 'claude-opus-4-5', display_name: 'Opus 4.5' },
        { id: 'embed-v1', display_name: 'Embed v1' },
        { id: 'claude-haiku-4-5', display_name: null }, // fallback to id
        { id: 'claude-sonnet-4-5', display_name: 'Sonnet 4.5' },
      ],
    }))
    const result = await mod.fetchModels('k')

    expect(result).toEqual([
      { id: 'claude-haiku-4-5', displayName: 'claude-haiku-4-5' },
      { id: 'claude-opus-4-5', displayName: 'Opus 4.5' },
      { id: 'claude-sonnet-4-5', displayName: 'Sonnet 4.5' },
    ])
    expect(mockState.instances[0].listCalls[0][0]).toEqual({ limit: 100 })
  })
})

describe('provider parity with localServer', () => {
  it('both modules export the same callable surface so the dispatcher can route either way', async () => {
    /**
     * The dispatcher in services/llm.ts treats the two provider modules
     * symmetrically — for every method it calls on anthropic.ts, it must
     * be able to call the same method on localServer.ts with arguments of
     * compatible arity. A drift here (e.g. someone adds a 7th param to
     * anthropic.streamChatResponse without adding it to localServer) would
     * compile but blow up at runtime in local mode.
     *
     * This is a structural smoke test, not a deep behavioral check —
     * dispatcher behavior lives in llm.test.ts and end-to-end streaming
     * lives in chatStore.test.ts.
     */
    const anthropicMod = await import('../../services/anthropic')
    const localMod = await import('../../services/localServer')
    const sharedMethods = ['streamChatResponse', 'sendMessage', 'sendMessageStreaming', 'fetchModels'] as const
    for (const name of sharedMethods) {
      expect(typeof anthropicMod[name as keyof typeof anthropicMod]).toBe('function')
      expect(typeof localMod[name as keyof typeof localMod]).toBe('function')
    }
  })
})

describe('toLlmError mapping (provider error contract)', () => {
  it('maps a 401 from the SDK to INVALID_API_KEY so the UI shows the curated copy', async () => {
    /**
     * The dispatcher contract: every provider (openai, localServer, and now
     * anthropic) surfaces failures as LlmError with a stable `code` so the
     * UI can look up friendly copy in LLM_ERROR_MESSAGES. Before this
     * wrapper existed, a bad Anthropic key reached the chat UI as a raw SDK
     * error and rendered the generic fallback instead of "Your API key
     * isn't valid. Update it in Settings."
     */
    const apiError = Object.assign(new Error('401 authentication_error'), { status: 401 })
    mockState.createImpl = vi.fn(async () => { throw apiError })

    await expect(mod.sendMessage('bad-key', 'm', 's', [], 100)).rejects.toMatchObject({
      name: 'LlmError',
      code: 'INVALID_API_KEY',
    })
  })

  it('maps a 429 to RATE_LIMITED and an unknown failure to UNKNOWN', async () => {
    /**
     * Rate limits are the other failure users actually hit with hosted
     * Anthropic; everything unrecognized must still arrive as an LlmError
     * (code UNKNOWN, original message preserved) so UI error handling never
     * has to branch on provider-specific error shapes.
     */
    mockState.createImpl = vi.fn(async () => {
      throw Object.assign(new Error('429 rate_limit_error'), { status: 429 })
    })
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

  it('delivers stream errors to onError as LlmError with a code', async () => {
    /**
     * ChatView's onError handler renders LLM_ERROR_MESSAGES[error.code]
     * when the message is empty. Stream errors must carry a code like the
     * non-streaming path does, otherwise mid-stream auth failures show the
     * raw SDK message.
     */
    const fake = mockState.installFakeStream()
    const onError = vi.fn()
    await mod.streamChatResponse('k', 'm', 's', [], 1, () => {}, () => {}, onError)

    fake.emitError(Object.assign(new Error('overloaded'), { status: 429 }))

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatchObject({ name: 'LlmError', code: 'RATE_LIMITED' })
  })
})

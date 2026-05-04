import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { normalizeBaseUrl, probe, fetchModels, fetchLoadedModelDetails, streamChatResponse, sendMessage } from '../../services/localServer'
import { LlmError } from '../../services/llm'

/**
 * `fetch` lives on globalThis in jsdom; `vi.spyOn(globalThis, 'fetch')` lets
 * each test pin its own response without polluting other tests. The mock
 * returns a real `Response` (with `ReadableStream` body when streaming) so
 * the production code's `response.body.getReader()` path runs unchanged.
 */
const fetchSpy = vi.fn()

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Build a Response whose body is a ReadableStream emitting the given chunks
 * one at a time. This is how we exercise the SSE parser's chunk-boundary
 * buffering — splitting a JSON event across two reader chunks proves the
 * buffer-until-`\n\n` logic is correct.
 */
function streamingResponse(chunks: (string | Uint8Array)[]): Response {
  const encoder = new TextEncoder()
  const encoded = chunks.map((c) => (typeof c === 'string' ? encoder.encode(c) : c))
  let i = 0
  const stream = new ReadableStream({
    pull(controller) {
      if (i < encoded.length) controller.enqueue(encoded[i++])
      else controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('normalizeBaseUrl', () => {
  it('trims trailing slashes and forgives a missing /v1 suffix', () => {
    /**
     * Users routinely paste either "http://localhost:1234" (Tauri devtools
     * suggestion) or "http://localhost:1234/v1" (LM Studio docs). Both must
     * work without surprising 404s. The normalizer also strips trailing
     * slashes so `${url}/chat/completions` doesn't double-slash.
     */
    expect(normalizeBaseUrl('http://localhost:1234')).toBe('http://localhost:1234/v1')
    expect(normalizeBaseUrl('http://localhost:1234/v1')).toBe('http://localhost:1234/v1')
    expect(normalizeBaseUrl('http://localhost:1234/v1/')).toBe('http://localhost:1234/v1')
    expect(normalizeBaseUrl('http://localhost:1234///')).toBe('http://localhost:1234/v1')
  })

  it('rewrites the /api/v1 native LMS path to /v1 OpenAI-compat path', () => {
    /**
     * LM Studio's "use in code" snippets sometimes show the native REST
     * path "http://localhost:1234/api/v1/chat" — a different API with a
     * different request body that this module doesn't speak. If a user
     * pastes that URL, naively forwarding it would POST to
     * `/api/v1/chat/completions` and get a confusing 404. Rewriting to
     * `/v1` gets them onto the OpenAI-compatible endpoint that LM Studio
     * also exposes, which is what we actually call.
     */
    expect(normalizeBaseUrl('http://localhost:1234/api/v1')).toBe('http://localhost:1234/v1')
    expect(normalizeBaseUrl('http://localhost:1234/api/v1/')).toBe('http://localhost:1234/v1')
    // /api on its own (no version) is left alone — could be a real proxy.
    expect(normalizeBaseUrl('http://localhost:1234/api')).toBe('http://localhost:1234/api/v1')
  })
})

describe('probe', () => {
  it('returns ok with model list on a 200 response', async () => {
    /**
     * Happy path: LM Studio is running and has at least one model loaded.
     * The settings UI uses this to populate the model autocomplete and
     * drive the "Ready" status indicator.
     */
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'gemma-2-2b' }, { id: 'qwen-2-7b' }] }), { status: 200 }))
    const result = await probe('http://localhost:1234/v1')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.models).toEqual([
      { id: 'gemma-2-2b', displayName: 'gemma-2-2b' },
      { id: 'qwen-2-7b', displayName: 'qwen-2-7b' },
    ])
  })

  it('returns ok with empty models when the server is up but no model is loaded', async () => {
    /**
     * LM Studio runs the server independently of model loading. Empty
     * `data: []` is the signal for "Start Server pressed but no Load
     * Model click yet" — the UI maps this to the amber status state.
     */
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    const result = await probe('http://localhost:1234/v1')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.models).toEqual([])
  })

  it('returns connection-refused when fetch throws', async () => {
    /**
     * `fetch` to a closed port throws TypeError "Failed to fetch" with no
     * specific code. Probe catches all non-AbortError throws and labels
     * them connection-refused so the UI can show the "Start Server" prompt.
     */
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const result = await probe('http://localhost:1234/v1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('connection-refused')
  })

  it('returns timeout when the request exceeds the deadline', async () => {
    /**
     * 2-second default keeps a misconfigured base URL from hanging the
     * settings page. Real fetch responds synchronously to abort() so the
     * test only needs to abort before resolving.
     */
    fetchSpy.mockImplementationOnce((_url, init) => new Promise((_, reject) => {
      const sig = (init as RequestInit | undefined)?.signal
      sig?.addEventListener('abort', () => {
        const e = new Error('aborted'); e.name = 'AbortError'; reject(e)
      })
    }))
    const result = await probe('http://localhost:1234/v1', 10)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('timeout')
  })
})

describe('fetchLoadedModelDetails', () => {
  it('hits the LMS-native /api/v1/models endpoint (sibling of /v1, not nested) and maps loaded/max context length', async () => {
    /**
     * LM Studio exposes a NATIVE REST API at /api/v1/* that's distinct
     * from the OpenAI-compat /v1/* path — `/api/v1/chat` has a different
     * request body shape from `/v1/chat/completions`. We don't speak the
     * native chat endpoint (would lock us out of Ollama compat), but we
     * DO call /api/v1/models because it's the only place LM Studio
     * surfaces per-model loaded/max context length.
     *
     * Response shape pinned here is from a real LM Studio 0.3.x install:
     * top-level `models[]`, model id under `key`, loaded context under
     * `loaded_instances[0].config.context_length`, max under top-level
     * `max_context_length`.
     */
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      models: [
        {
          type: 'llm',
          key: 'google/gemma-4-e4b',
          max_context_length: 131072,
          loaded_instances: [
            { id: 'google/gemma-4-e4b', config: { context_length: 47783 } },
          ],
        },
      ],
    }), { status: 200 }))
    const result = await fetchLoadedModelDetails('http://localhost:1234/v1')
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:1234/api/v1/models')
    expect(result).toEqual([
      { id: 'google/gemma-4-e4b', loadedContextLength: 47783, maxContextLength: 131072 },
    ])
  })

  it('returns [] (not an error) when the endpoint is unreachable — graceful fallback for Ollama et al', async () => {
    /**
     * Ollama and llama.cpp's server speak the OpenAI-compat /v1/models
     * but don't have the LMS-native /api/v1 endpoint. Their probe will
     * 404 (or in some setups, the request will throw). Either way the
     * UI shouldn't crash or show a warning — just no context-length row.
     */
    fetchSpy.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    expect(await fetchLoadedModelDetails('http://localhost:1234/v1')).toEqual([])

    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await fetchLoadedModelDetails('http://localhost:1234/v1')).toEqual([])
  })

  it('returns loadedContextLength: null when a known model has no loaded_instances (e.g. an embedding model the user downloaded but never loaded)', async () => {
    /**
     * The /api/v1/models endpoint lists *every* model LM Studio knows
     * about, including ones not currently loaded. Their
     * loaded_instances array is empty. We surface them with null context
     * (rather than dropping them) so the merge with /v1/models can still
     * tag them by id. The "is this model usable" decision lives in
     * /v1/models (which only lists loaded chat models), not here.
     */
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      models: [
        {
          type: 'llm',
          key: 'google/gemma-4-e4b',
          max_context_length: 131072,
          loaded_instances: [{ id: 'google/gemma-4-e4b', config: { context_length: 4096 } }],
        },
        {
          type: 'embedding',
          key: 'text-embedding-nomic-embed-text-v1.5',
          max_context_length: 2048,
          loaded_instances: [], // not loaded
        },
      ],
    }), { status: 200 }))
    const result = await fetchLoadedModelDetails('http://localhost:1234/v1')
    expect(result).toEqual([
      { id: 'google/gemma-4-e4b', loadedContextLength: 4096, maxContextLength: 131072 },
      { id: 'text-embedding-nomic-embed-text-v1.5', loadedContextLength: null, maxContextLength: 2048 },
    ])
  })
})

describe('fetchModels', () => {
  it('throws LlmError(CONNECTION_REFUSED) when the server is unreachable', async () => {
    /**
     * `fetchModels` is the dispatcher's escape hatch when callers want a
     * thrown error rather than a probe result tuple. The settings UI
     * uses `probe`; chat send paths use `fetchModels` and rely on the
     * thrown error to reach the catalog mapping in `LLM_ERROR_MESSAGES`.
     */
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(fetchModels('http://localhost:1234')).rejects.toBeInstanceOf(LlmError)
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(fetchModels('http://localhost:1234')).rejects.toMatchObject({ code: 'CONNECTION_REFUSED' })
  })
})

describe('streamChatResponse', () => {
  it('decodes OpenAI-style SSE chunks and forwards cumulative onChunk in arrival order', async () => {
    /**
     * The contract chatStore.updateStreamingMessage relies on: every
     * onChunk call carries the full text so far, not the delta. If the
     * SSE parser emitted deltas, the chat UI would render only the last
     * chunk. Test with three chunks so the cumulative property is visible.
     */
    fetchSpy.mockResolvedValueOnce(streamingResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const chunks: string[] = []
    const completes: string[] = []
    await streamChatResponse(
      'http://localhost:1234', 'gemma', '', [{ role: 'user', content: 'hi' }], 100,
      (c) => chunks.push(c), (c) => completes.push(c), () => {},
    )
    expect(chunks).toEqual(['Hel', 'Hello', 'Hello world'])
    expect(completes).toEqual(['Hello world'])
  })

  it('buffers across reader chunk boundaries (event split mid-stream)', async () => {
    /**
     * The reader returns Uint8Arrays in arbitrary chunk sizes. A single
     * SSE event can be split across reads, e.g. half the JSON arriving
     * in chunk N and the rest in chunk N+1. The parser must wait for
     * the full `\n\n` terminator before parsing — without buffering, the
     * partial JSON would throw and the message would be dropped.
     */
    fetchSpy.mockResolvedValueOnce(streamingResponse([
      'data: {"choices":[{"de',
      'lta":{"content":"split-ok"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const chunks: string[] = []
    await streamChatResponse(
      'http://localhost:1234', 'gemma', '', [], 100,
      (c) => chunks.push(c), () => {}, () => {},
    )
    expect(chunks).toEqual(['split-ok'])
  })

  it('handles multi-byte UTF-8 split across reader chunks without corruption', async () => {
    /**
     * The most-likely silent breakage in any SSE client. The 4-byte UTF-8
     * sequence for "𝐀" (U+1D400) is bytes [F0 9D 90 80]. Split it across
     * two reader chunks: TextDecoder({stream:true}) holds the leading
     * bytes until it has a complete code point. Without `{stream:true}`,
     * the decoder emits a replacement char at the boundary and the model
     * output corrupts mid-stream.
     */
    const fullEvent = 'data: {"choices":[{"delta":{"content":"𝐀"}}]}\n\n'
    const bytes = new TextEncoder().encode(fullEvent)
    // Find the first byte of the 4-byte UTF-8 sequence and split inside it.
    const splitAt = bytes.indexOf(0xf0)
    expect(splitAt).toBeGreaterThan(-1)
    fetchSpy.mockResolvedValueOnce(streamingResponse([
      bytes.slice(0, splitAt + 2), // first half — middle of the 4-byte char
      bytes.slice(splitAt + 2),    // second half — completes the char
      'data: [DONE]\n\n',
    ]))
    const chunks: string[] = []
    await streamChatResponse(
      'http://localhost:1234', 'gemma', '', [], 100,
      (c) => chunks.push(c), () => {}, () => {},
    )
    expect(chunks).toEqual(['𝐀'])
  })

  it('skips [DONE] markers and malformed/empty data lines without crashing', async () => {
    /**
     * `[DONE]` is the OpenAI sentinel for "stream finished cleanly". A
     * keepalive can arrive as `: ping` or as an empty `data: ` line, and
     * occasional malformed JSON shouldn't kill the whole stream — just
     * skip the bad event and keep going.
     */
    fetchSpy.mockResolvedValueOnce(streamingResponse([
      'data: \n\n',                                                    // empty
      ': keepalive\n\n',                                                // comment
      'data: not-json\n\n',                                             // malformed
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',             // valid
      'data: [DONE]\n\n',
    ]))
    const chunks: string[] = []
    let completed = ''
    await streamChatResponse(
      'http://localhost:1234', 'gemma', '', [], 100,
      (c) => chunks.push(c), (c) => { completed = c }, () => {},
    )
    expect(chunks).toEqual(['ok'])
    expect(completed).toBe('ok')
  })

  it('translates a 400/404 from /chat/completions to NO_MODEL_LOADED', async () => {
    /**
     * LM Studio returns 400 with "no model loaded" before any model has
     * been clicked Load. The UI catalog treats 400 and 404 the same way
     * because both mean "send a message later, after loading a model."
     */
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 400 }))
    const errors: unknown[] = []
    await streamChatResponse(
      'http://localhost:1234', 'gemma', '', [], 100,
      () => {}, () => {}, (e) => errors.push(e),
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(LlmError)
    expect((errors[0] as LlmError).code).toBe('NO_MODEL_LOADED')
  })

  it('translates a 400 with context-overflow wording in the body to CONTEXT_TOO_LARGE, not NO_MODEL_LOADED', async () => {
    /**
     * Same 400 status, very different remediation. If the body mentions
     * context size / length / n_keep, the user needs to re-load the model
     * with a larger context window — telling them "load a model" is
     * actively wrong and would send them in circles.
     */
    fetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: 'request (29922 tokens) exceeds the available context size (4096 tokens), try increasing it' }),
      { status: 400 },
    ))
    const errors: unknown[] = []
    await streamChatResponse(
      'http://localhost:1234', 'gemma', '', [], 100,
      () => {}, () => {}, (e) => errors.push(e),
    )
    expect((errors[0] as LlmError).code).toBe('CONTEXT_TOO_LARGE')
  })

  it('detects an SSE error event mid-stream → onError fires once and onComplete is NEVER called', async () => {
    /**
     * The actual production bug we hit: LM Studio returns HTTP 200 (the
     * server is up, the model loaded), starts the stream, then sends
     * `data: {"error": "..."}` because the model couldn't fit the prompt.
     * The old parser silently swallowed the error event, ran to the end
     * of the stream, and called onComplete('') with empty text. ChatView
     * then ran title generation against the empty assistant message,
     * producing the "title appears, no reply" symptom.
     *
     * After the fix: error events route to onError, onComplete never
     * fires. ChatView sees a real error and surfaces it.
     */
    fetchSpy.mockResolvedValueOnce(streamingResponse([
      'data: {"error": "n_keep is greater than the context length"}\n\n',
    ]))
    const onChunk = vi.fn()
    const onComplete = vi.fn()
    const errors: unknown[] = []
    await streamChatResponse(
      'http://localhost:1234', 'gemma', '', [], 100,
      onChunk, onComplete, (e) => errors.push(e),
    )
    expect(onComplete).not.toHaveBeenCalled()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(LlmError)
    expect((errors[0] as LlmError).code).toBe('CONTEXT_TOO_LARGE')
  })

  it('handles the {error: {message, type}} object shape (alternate LM Studio format)', async () => {
    /**
     * LM Studio sometimes wraps the error as a flat string ("error":
     * "...") and sometimes as an object ({"error": {"message": "...",
     * "type": "..."}}) depending on the version and which subsystem
     * tripped. Both shapes must surface to onError; only the
     * context-overflow sniff distinguishes the user-facing message.
     */
    fetchSpy.mockResolvedValueOnce(streamingResponse([
      'data: {"error": {"message": "something went wrong", "type": "internal"}}\n\n',
    ]))
    const errors: unknown[] = []
    const onComplete = vi.fn()
    await streamChatResponse(
      'http://localhost:1234', 'gemma', '', [], 100,
      () => {}, onComplete, (e) => errors.push(e),
    )
    expect(onComplete).not.toHaveBeenCalled()
    expect((errors[0] as LlmError).code).toBe('UNKNOWN')
    expect((errors[0] as LlmError).message).toContain('something went wrong')
  })

  it('translates a network throw to CONNECTION_REFUSED and never calls onComplete', async () => {
    /**
     * If LM Studio's server is off, the very first fetch throws TypeError
     * "Failed to fetch". The wrapper must convert that to a stable code
     * and must NOT call onComplete — otherwise the chat store would
     * finalize an empty assistant message and the user would think their
     * AI just sent them silence.
     */
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const onComplete = vi.fn()
    const errors: unknown[] = []
    await streamChatResponse(
      'http://localhost:1234', 'gemma', '', [], 100,
      () => {}, onComplete, (e) => errors.push(e),
    )
    expect((errors[0] as LlmError).code).toBe('CONNECTION_REFUSED')
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('places the system prompt as the leading {role:system} message in the request body', async () => {
    /**
     * OpenAI convention vs Anthropic SDK: OpenAI takes the system prompt
     * as the first message in the array, Anthropic takes it as a top-level
     * field. The wrapper must do that translation or the model receives
     * an empty system prompt and ignores all therapy/profile context.
     */
    fetchSpy.mockResolvedValueOnce(streamingResponse(['data: [DONE]\n\n']))
    await streamChatResponse(
      'http://localhost:1234', 'gemma', 'You are helpful.',
      [{ role: 'user', content: 'hi' }], 100,
      () => {}, () => {}, () => {},
    )
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hi' },
    ])
    expect(body.model).toBe('gemma')
    expect(body.max_tokens).toBe(100)
    expect(body.stream).toBe(true)
  })

  it('joins baseUrl and /chat/completions cleanly regardless of trailing slash', async () => {
    /**
     * If the user pastes a base URL with a trailing slash, the wrapper
     * must not produce a double-slash URL like `localhost:1234/v1//chat/...`.
     * Some servers tolerate it; LM Studio in particular does not on the
     * v1 router for the chat endpoint.
     */
    fetchSpy.mockResolvedValueOnce(streamingResponse(['data: [DONE]\n\n']))
    await streamChatResponse(
      'http://localhost:1234/v1/', 'gemma', '', [], 100,
      () => {}, () => {}, () => {},
    )
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:1234/v1/chat/completions')
  })

  it('forwards an AbortSignal to fetch so callers can cancel mid-stream', async () => {
    /**
     * Chat-cancel and entryProcessor's stop button both rely on aborts
     * propagating through to the underlying fetch. Without this wiring,
     * clicking Stop leaves the request churning until LM Studio finishes
     * generating — and on a slow local model that can be tens of seconds.
     */
    fetchSpy.mockResolvedValueOnce(streamingResponse(['data: [DONE]\n\n']))
    const controller = new AbortController()
    await streamChatResponse(
      'http://localhost:1234', 'gemma', '', [], 100,
      () => {}, () => {}, () => {}, controller.signal,
    )
    const opts = fetchSpy.mock.calls[0][1] as RequestInit
    expect(opts.signal).toBe(controller.signal)
  })
})

describe('sendMessage', () => {
  it('returns the choices[0].message.content from a 200 response', async () => {
    /**
     * Non-streaming counterpart used by entryProcessor for one-shot
     * summarization. OpenAI shape: response.choices[0].message.content.
     */
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: 'parsed metadata json' } }],
    }), { status: 200 }))
    const result = await sendMessage('http://localhost:1234', 'gemma', 'sys', [{ role: 'user', content: 'q' }])
    expect(result).toBe('parsed metadata json')
  })

  it('throws LlmError(NO_MODEL_LOADED) on 400/404 so callers can map to user-friendly copy', async () => {
    /**
     * entryProcessor's processEntry throws when sendMessage throws — the
     * journalStore.processEntries loop catches it and continues with the
     * next entry. The UI sees a "skipped" toast rather than a stack trace.
     */
    fetchSpy.mockResolvedValueOnce(new Response('not loaded', { status: 404 }))
    await expect(sendMessage('http://localhost:1234', 'gemma', 'sys', [], 100))
      .rejects.toMatchObject({ code: 'NO_MODEL_LOADED' })
  })
})

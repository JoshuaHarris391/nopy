import { LlmError, LLM_ERROR_MESSAGES } from './llm'

type Message = { role: 'user' | 'assistant'; content: string }

/**
 * Trim trailing slash and forgive a missing `/v1` suffix so users can paste
 * either form ("http://localhost:1234" or "http://localhost:1234/v1") and
 * the rest of this module just appends `/chat/completions` etc. cleanly.
 *
 * Also strips a leading `/api` segment if the user pasted LM Studio's
 * native REST path (`http://localhost:1234/api/v1`) by mistake. LM Studio
 * shows that URL in some "use in code" snippets, but it's a different
 * (LMS-native, non-OpenAI-compat) API that this module doesn't speak.
 * Auto-correcting saves the user a confusing 404.
 */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '')
  // Strip /api before /v\d so http://host/api/v1 → http://host/v1.
  url = url.replace(/\/api(\/v\d+)$/, '$1')
  if (!/\/v\d+$/.test(url)) url = `${url}/v1`
  return url
}

interface ProbeOk {
  ok: true
  models: { id: string; displayName: string }[]
}
interface ProbeFail {
  ok: false
  reason: 'connection-refused' | 'timeout' | 'http-error'
  status?: number
}
export type ProbeResult = ProbeOk | ProbeFail

/**
 * Lightweight liveness check used by the settings UI to drive the status
 * indicator. 2s timeout so a misconfigured URL doesn't hang the page.
 * Always resolves — never throws — so callers can render a state without
 * try/catch.
 */
export async function probe(baseUrl: string, timeoutMs: number = 2000): Promise<ProbeResult> {
  const url = `${normalizeBaseUrl(baseUrl)}/models`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return { ok: false, reason: 'http-error', status: res.status }
    const body = (await res.json()) as { data?: { id: string }[] }
    const models = (body.data ?? []).map((m) => ({ id: m.id, displayName: m.id }))
    return { ok: true, models }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ok: false, reason: 'timeout' }
    return { ok: false, reason: 'connection-refused' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Same shape as `anthropic.fetchModels` so callers don't care which provider
 * supplied the list. Throws `LlmError('CONNECTION_REFUSED' | 'NO_MODEL_LOADED')`
 * if the daemon is unreachable or returns an empty model list.
 */
export async function fetchModels(baseUrl: string): Promise<{ id: string; displayName: string }[]> {
  const result = await probe(baseUrl)
  if (!result.ok) {
    throw toLlmError(result)
  }
  return result.models
}

function toLlmError(probeResult: ProbeFail): LlmError {
  if (probeResult.reason === 'timeout') return new LlmError('TIMEOUT', LLM_ERROR_MESSAGES.TIMEOUT)
  return new LlmError('CONNECTION_REFUSED', LLM_ERROR_MESSAGES.CONNECTION_REFUSED)
}

function buildOpenAiBody(model: string, system: string, messages: Message[], maxTokens: number, stream: boolean) {
  // OpenAI conventions: system prompt is the leading message, not a separate field.
  const fullMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages
  return { model, messages: fullMessages, max_tokens: maxTokens, stream }
}

/**
 * Translate fetch / HTTP errors into a stable LlmError. The dispatcher
 * UI catalog reads `err.code` for its message lookup — keep this map in
 * sync with `LlmErrorCode` in llm.ts.
 */
async function translateHttpError(res: Response): Promise<LlmError> {
  const text = await res.text().catch(() => '')
  if (res.status === 401) return new LlmError('INVALID_API_KEY', LLM_ERROR_MESSAGES.INVALID_API_KEY)
  if (res.status === 429) return new LlmError('RATE_LIMITED', LLM_ERROR_MESSAGES.RATE_LIMITED)
  if (res.status === 400 || res.status === 404) {
    // LM Studio returns 400 with "no model loaded" when /chat/completions is
    // hit before a model has been clicked Load in the UI. Treat 400/404 the
    // same way so the user gets actionable copy.
    return new LlmError('NO_MODEL_LOADED', LLM_ERROR_MESSAGES.NO_MODEL_LOADED, { status: res.status, body: text })
  }
  return new LlmError('UNKNOWN', `Local server returned HTTP ${res.status}`, { status: res.status, body: text })
}

function translateFetchError(e: unknown): LlmError {
  if ((e as Error).name === 'AbortError') {
    // Re-throw aborts as-is so AbortSignal users can detect them by name.
    return new LlmError('UNKNOWN', 'Aborted', e)
  }
  // Browser fetch throws TypeError "Failed to fetch" / "NetworkError" for
  // ECONNREFUSED. There's no specific error code — assume connection-refused
  // unless we have evidence otherwise.
  return new LlmError('CONNECTION_REFUSED', LLM_ERROR_MESSAGES.CONNECTION_REFUSED, e)
}

/**
 * Stream chat tokens from an OpenAI-compatible endpoint via SSE. Mirrors
 * `anthropic.streamChatResponse` exactly — `onChunk` receives the cumulative
 * text on every event so chatStore.updateStreamingMessage can replace the
 * last message's content directly.
 */
export async function streamChatResponse(
  baseUrl: string,
  model: string,
  system: string,
  messages: Message[],
  maxTokens: number,
  onChunk: (fullText: string) => void,
  onComplete: (fullText: string) => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`
  const body = buildOpenAiBody(model, system, messages, maxTokens, true)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    onError(translateFetchError(e))
    return
  }

  if (!response.ok) {
    onError(await translateHttpError(response))
    return
  }
  if (!response.body) {
    onError(new LlmError('UNKNOWN', 'Local server returned no response body'))
    return
  }

  const reader = response.body.getReader()
  // `stream: true` is mandatory — multi-byte UTF-8 (CJK, emoji) routinely
  // splits across reader chunks; without stream-mode the decoder would
  // emit replacement chars mid-token.
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let buffer = ''
  let fullText = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let eventEnd: number
      while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
        const eventBlock = buffer.slice(0, eventEnd)
        buffer = buffer.slice(eventEnd + 2)
        for (const line of eventBlock.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '' || data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[]
            }
            const delta = parsed.choices?.[0]?.delta?.content
            if (typeof delta === 'string' && delta.length > 0) {
              fullText += delta
              onChunk(fullText)
            }
          } catch {
            // Malformed JSON line — common for keepalive comments. Ignore.
          }
        }
      }
    }
    onComplete(fullText)
  } catch (e) {
    onError(translateFetchError(e))
  }
}

/**
 * Non-streaming counterpart to `anthropic.sendMessage`. Used by
 * entryProcessor for one-shot summarization / tagging calls. Returns the
 * assistant's message content as a string; throws `LlmError` on failure.
 */
export async function sendMessage(
  baseUrl: string,
  model: string,
  system: string,
  messages: Message[],
  maxTokens: number = 500,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`
  const body = buildOpenAiBody(model, system, messages, maxTokens, false)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    throw translateFetchError(e)
  }
  if (!response.ok) throw await translateHttpError(response)
  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  return json.choices?.[0]?.message?.content ?? ''
}

/**
 * Streaming variant that still resolves with the full text at the end. Used
 * by `entryProcessor.generateProfileFromEntries` and `generateFullProfile`,
 * which want a progress indicator (`onProgress(charsReceived)`) while still
 * needing the full string for downstream parsing.
 */
export async function sendMessageStreaming(
  baseUrl: string,
  model: string,
  system: string,
  messages: Message[],
  maxTokens: number,
  onProgress: (charsReceived: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    streamChatResponse(
      baseUrl, model, system, messages, maxTokens,
      (fullText) => onProgress(fullText.length),
      (fullText) => resolve(fullText),
      (err) => reject(err),
      signal,
    )
  })
}

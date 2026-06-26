import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { LlmError, LLM_ERROR_MESSAGES } from './llm'
import { hasFileSystem } from './fs'
import type { ChatUsage } from '../types/chat'

type Message = { role: 'user' | 'assistant'; content: string }

/**
 * Route HTTP via Tauri's `tauri-plugin-http` (Rust reqwest under the hood)
 * when running inside the Tauri webview, and fall back to native fetch
 * otherwise (jsdom tests, plain `npm run dev` in a browser).
 *
 * Why: LM Studio doesn't send Access-Control-Allow-Origin headers, so the
 * WebKit/Chromium renderer refuses to expose `/v1/models` responses to JS
 * even though the request succeeds (status 200). Going through Rust
 * bypasses the browser's same-origin policy entirely — no LM Studio CORS
 * toggle required.
 *
 * `hasFileSystem()` is the cheapest "are we in Tauri?" check we already
 * have (it tests `__TAURI_INTERNALS__` on window). Using globalThis.fetch
 * in tests means the existing vi.spyOn(globalThis, 'fetch') setup keeps
 * working untouched.
 */
const lmFetch: typeof fetch = (input, init) => {
  if (hasFileSystem()) return tauriFetch(input as string, init) as Promise<Response>
  return fetch(input, init)
}

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
    const res = await lmFetch(url, { signal: controller.signal })
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
 * LM Studio's *native* REST API (separate from the OpenAI-compat path)
 * exposes per-model loaded/max context length under `/api/v1/models`.
 * The OpenAI-compat `/v1/models` doesn't include those fields. This
 * function tries the native endpoint and silently no-ops if it 404s
 * (Ollama and other OpenAI-compat runtimes don't have it) — graceful
 * degradation, never throws.
 *
 * Why we want this: a Gemma 4 E4B loaded with the default 4096-token
 * context will fail every chat send with our system prompt (~30k
 * tokens). Surfacing the loaded context in Settings lets the user spot
 * this BEFORE sending a message, with a "you probably want 32k+" hint.
 */
export interface LoadedModelDetails {
  id: string
  loadedContextLength: number | null
  maxContextLength: number | null
}

export async function fetchLoadedModelDetails(baseUrl: string, timeoutMs: number = 2000): Promise<LoadedModelDetails[]> {
  // LM Studio's native /api/v1/models is a sibling of /v1 under the same
  // host, not nested. Strip the trailing /vN segment from the normalized
  // base to get the host root.
  //
  // Response shape (verified against LM Studio 0.3.x):
  //   { models: [{
  //       key: "google/gemma-4-e4b",
  //       max_context_length: 131072,
  //       loaded_instances: [{ id, config: { context_length: 47783 } }],
  //       ...
  //   }] }
  //
  // The "loaded" context is per-instance under loaded_instances[0].config —
  // LM Studio supports loading the same model multiple times with different
  // configs, so we take the first instance as canonical. Models with an
  // empty loaded_instances list (e.g. embedding models the user has
  // downloaded but not loaded) get loadedContextLength: null and won't
  // affect any chat-model warning.
  const normalized = normalizeBaseUrl(baseUrl)
  const root = normalized.replace(/\/v\d+$/, '')
  const url = `${root}/api/v1/models`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await lmFetch(url, { signal: controller.signal })
    if (!res.ok) return []
    const body = (await res.json()) as {
      models?: Array<{
        key?: string
        max_context_length?: number
        loaded_instances?: Array<{ config?: { context_length?: number } }>
      }>
    }
    return (body.models ?? [])
      .filter((m) => typeof m.key === 'string')
      .map((m) => {
        const loadedCtx = m.loaded_instances?.[0]?.config?.context_length
        return {
          id: m.key as string,
          loadedContextLength: typeof loadedCtx === 'number' ? loadedCtx : null,
          maxContextLength: typeof m.max_context_length === 'number' ? m.max_context_length : null,
        }
      })
  } catch {
    return []
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
 * Sniff for LM Studio's various ways of saying "your prompt won't fit in
 * this model's context window". Wording differs between the model
 * runtime (llama.cpp emits "n_keep ... is greater than the context
 * length") and the OpenAI-compat layer ("exceeds the available context
 * size"), so we match a few fragments rather than one exact phrase.
 */
function looksLikeContextOverflow(text: string): boolean {
  if (!text) return false
  const lowered = text.toLowerCase()
  return (
    lowered.includes('context size') ||
    lowered.includes('context length') ||
    lowered.includes('exceeds the available context') ||
    lowered.includes('n_keep') ||
    lowered.includes('larger context length')
  )
}

/**
 * Translate fetch / HTTP errors into a stable LlmError. The dispatcher
 * UI catalog reads `err.code` for its message lookup — keep this map in
 * sync with `LlmErrorCode` in llm.ts.
 *
 * 400s from LM Studio are ambiguous: it returns 400 for "no model
 * loaded" AND for "context length exceeded" AND for any other validation
 * failure. We sniff the body for context-overflow wording so users get
 * "your prompt is too big" instead of the misleading "load a model".
 */
async function translateHttpError(res: Response): Promise<LlmError> {
  const text = await res.text().catch(() => '')
  if (res.status === 401) return new LlmError('INVALID_API_KEY', LLM_ERROR_MESSAGES.INVALID_API_KEY)
  if (res.status === 429) return new LlmError('RATE_LIMITED', LLM_ERROR_MESSAGES.RATE_LIMITED)
  if (res.status === 400 || res.status === 404) {
    if (looksLikeContextOverflow(text)) {
      return new LlmError('CONTEXT_TOO_LARGE', LLM_ERROR_MESSAGES.CONTEXT_TOO_LARGE, { status: res.status, body: text })
    }
    return new LlmError('NO_MODEL_LOADED', LLM_ERROR_MESSAGES.NO_MODEL_LOADED, { status: res.status, body: text })
  }
  return new LlmError('UNKNOWN', `Local server returned HTTP ${res.status}`, { status: res.status, body: text })
}

/**
 * LM Studio (and any OpenAI-compatible runtime) can stream errors
 * mid-response when the model errors *after* the HTTP 200 has already
 * been sent — context overflow is the most common cause. Without this
 * check our SSE parser silently swallows the error event, runs to the
 * end of the stream, and fires `onComplete('')` with empty text — which
 * is exactly the "title gets generated but no chat reply appears"
 * symptom we hit in production.
 *
 * Returns a typed `LlmError` so the streaming loop can throw it; the
 * outer try/catch routes it to `onError` without re-translating it as a
 * connection-refused error.
 */
function errorFromSseEvent(parsed: unknown): LlmError | null {
  if (!parsed || typeof parsed !== 'object') return null
  const errorField = (parsed as { error?: unknown }).error
  if (!errorField) return null
  const message =
    typeof errorField === 'string'
      ? errorField
      : (errorField as { message?: string }).message ?? JSON.stringify(errorField)
  if (looksLikeContextOverflow(message)) {
    return new LlmError('CONTEXT_TOO_LARGE', LLM_ERROR_MESSAGES.CONTEXT_TOO_LARGE, { sseError: message })
  }
  return new LlmError('UNKNOWN', `Local model returned an error: ${message}`, { sseError: message })
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
  // `usage` arg kept for parity with the dispatcher signature; LM Studio's
  // streaming response carries no billed usage, so it's never passed.
  onComplete: (fullText: string, usage?: ChatUsage) => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`
  const body = buildOpenAiBody(model, system, messages, maxTokens, true)

  let response: Response
  try {
    response = await lmFetch(url, {
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
          let parsed: unknown
          try {
            parsed = JSON.parse(data)
          } catch {
            // Malformed JSON line — common for keepalive comments. Ignore.
            continue
          }
          // Error events take priority over content deltas: throwing here
          // short-circuits the loop so onComplete is never called with
          // empty/partial text. The outer catch routes the LlmError
          // straight to onError without re-translating it.
          const sseError = errorFromSseEvent(parsed)
          if (sseError) throw sseError
          const delta = (parsed as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta.length > 0) {
            fullText += delta
            onChunk(fullText)
          }
        }
      }
    }
    onComplete(fullText)
  } catch (e) {
    // Don't double-translate an LlmError — that would label the
    // CONTEXT_TOO_LARGE we just threw as CONNECTION_REFUSED.
    if (e instanceof LlmError) onError(e)
    else onError(translateFetchError(e))
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
    response = await lmFetch(url, {
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

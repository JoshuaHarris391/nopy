import OpenAI from 'openai'
import { LlmError, LLM_ERROR_MESSAGES } from './llm'
import type { ChatUsage } from '../types/chat'
import type { ProviderModel } from './models'

/**
 * Venice speaks the OpenAI Chat Completions protocol verbatim — same
 * `{ model, messages, stream }` request body and the same `data:`-delimited
 * SSE response — so this module is a thin specialisation of `./openai.ts`
 * that only changes the base URL and the provider-name copy in error
 * messages. Keeping it separate (rather than parameterising `./openai.ts`)
 * preserves each provider module's one-job shape and lets Venice's error
 * copy and its curated model list evolve without touching the OpenAI path.
 */
export const VENICE_BASE_URL = 'https://api.venice.ai/api/v1'

/**
 * Models we always surface in the picker, merged into whatever the live
 * `/models` response returns. The live list is authoritative for capability
 * filtering, but Venice's catalog and our support matrix don't move in
 * lockstep: a model the user expects to see shouldn't disappear from the
 * dropdown because the API response shape changed or a listing lagged.
 * Deduped against the live list by id (see `fetchModels`).
 */
export const VENICE_KNOWN_MODELS = [
  'deepseek-v4-1-flash',
  'deepseek-v4-pro-0813',
  'claude-opus-4-8',
  'openai-gpt-6-luna',
] as const

let clientInstance: OpenAI | null = null
let currentApiKey = ''

export function getClient(apiKey: string): OpenAI {
  if (clientInstance && currentApiKey === apiKey) {
    console.log('[venice] getClient: reusing existing client')
    return clientInstance
  }
  console.log('[venice] getClient: creating new client instance')
  clientInstance = new OpenAI({ apiKey, baseURL: VENICE_BASE_URL, dangerouslyAllowBrowser: true })
  currentApiKey = apiKey
  return clientInstance
}

type Message = { role: 'user' | 'assistant'; content: string }

/**
 * Translate SDK errors into the dispatcher's LlmError shape so the UI can
 * surface curated copy from LLM_ERROR_MESSAGES instead of raw API messages —
 * same contract as the Anthropic/OpenAI/local providers. Detection is
 * duck-typed on `status` rather than `instanceof APIError` so it survives
 * SDK module mocking in tests.
 */
function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error
  const status = (error as { status?: unknown } | null)?.status
  const message = error instanceof Error ? error.message : String(error)
  if (typeof status === 'number') {
    if (status === 401) {
      return new LlmError('INVALID_API_KEY', "Your Venice API key isn't valid. Update it in Settings.", error)
    }
    if (status === 429) {
      return new LlmError('RATE_LIMITED', LLM_ERROR_MESSAGES.RATE_LIMITED, error)
    }
    if (status === 400 && /context|maximum.*token|too\s*long/i.test(message)) {
      return new LlmError('CONTEXT_TOO_LARGE', LLM_ERROR_MESSAGES.CONTEXT_TOO_LARGE, error)
    }
  }
  return new LlmError('UNKNOWN', message, error)
}

/**
 * Venice (like OpenAI) takes the system prompt as the leading message rather
 * than Anthropic's top-level `system` field. The UI passes `system` as a
 * separate string in every provider, so adapt the shape here.
 */
function buildMessages(system: string, messages: Message[]) {
  const out: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages) out.push({ role: m.role, content: m.content })
  return out
}

/**
 * The `usage` object Venice returns on an OpenAI-shaped completion: `prompt_tokens`
 * is the TOTAL input (cache reads and writes included), and the split lives in
 * `prompt_tokens_details`. `cached_tokens` is typed by the OpenAI SDK;
 * `cache_creation_input_tokens` is a Venice extension, hence the local shape.
 */
interface VeniceUsage {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number; cache_creation_input_tokens?: number } | null
}

/**
 * Map Venice's `usage` onto our `ChatUsage`, which expects `inputTokens` to be
 * the *uncached* full-price portion (cache reads/writes are tracked separately
 * so the header's cost estimate stays accurate). Venice reports the prompt as a
 * total — its caching docs table shows prompt = uncached + cache read + cache
 * write (11,031 = 62 uncached + 10,938 read + 31 write) — so the uncached part is
 * the remainder, clamped at zero in case a provider double-counts.
 */
function toChatUsage(raw: VeniceUsage | null | undefined): ChatUsage | undefined {
  if (!raw) return undefined
  const prompt = raw.prompt_tokens ?? 0
  const cacheRead = raw.prompt_tokens_details?.cached_tokens ?? 0
  const cacheWrite = raw.prompt_tokens_details?.cache_creation_input_tokens ?? 0
  return {
    inputTokens: Math.max(prompt - cacheRead - cacheWrite, 0),
    outputTokens: raw.completion_tokens ?? 0,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  }
}

export async function streamChatResponse(
  apiKey: string,
  model: string,
  system: string,
  messages: Message[],
  maxTokens: number,
  onChunk: (fullText: string) => void,
  // Venice reports real billed usage — including cache reads/writes — once
  // `stream_options.include_usage` is set (see `toChatUsage`), so the chat
  // header can show the same cache-adjusted figure as Anthropic.
  onComplete: (fullText: string, usage?: ChatUsage) => void,
  onError: (error: Error) => void,
  // Routing hint: the turns of one conversation share a key so Venice prefers
  // the same backend, keeping the warm prefix cache alive. Optional — omitting
  // it only lowers the hit rate (requests may land on a cold server).
  promptCacheKey?: string,
): Promise<void> {
  console.log('[venice] streamChatResponse: model', model, '| messages', messages.length, '| maxTokens', maxTokens, '| cacheKey', promptCacheKey ? 'yes' : 'none')
  let fullText = ''
  try {
    const client = getClient(apiKey)
    const stream = await client.chat.completions.create({
      model,
      messages: buildMessages(system, messages),
      max_tokens: maxTokens,
      stream: true,
      // Ask for the trailing usage chunk; without it a streaming Venice reply
      // carries no token/cache statistics at all.
      stream_options: { include_usage: true },
      ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
    })
    let usage: ChatUsage | undefined
    for await (const chunk of stream) {
      // The final chunk has empty `choices` and the whole request's usage.
      if (chunk.usage) usage = toChatUsage(chunk.usage)
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        fullText += delta
        onChunk(fullText)
      }
    }
    if (usage) {
      console.log(
        '[venice] streamChatResponse: cache —',
        'read', usage.cacheReadTokens,
        '| write', usage.cacheWriteTokens,
        '| uncached input', usage.inputTokens,
      )
    }
    console.log('[venice] streamChatResponse: complete —', fullText.length, 'chars received')
    onComplete(fullText, usage)
  } catch (error) {
    console.error('[venice] streamChatResponse: stream error —', error instanceof Error ? error.message : String(error))
    onError(toLlmError(error))
  }
}

/**
 * Venice reports each text model's *usable* window at
 * `model_spec.availableContextTokens` — the number the Context budget bar must
 * use (e.g. 1M for the Kimi models, not our 32k fallback). Absent or malformed
 * values are left undefined so the window falls back to the catalog/static map.
 */
function contextTokensFor(entry: Record<string, unknown>): number | undefined {
  const spec = entry.model_spec as Record<string, unknown> | undefined
  const tokens = spec?.availableContextTokens
  return typeof tokens === 'number' && tokens > 0 ? tokens : undefined
}

export async function fetchModels(apiKey: string): Promise<ProviderModel[]> {
  console.log('[venice] fetchModels: requesting model list')
  const client = getClient(apiKey)
  const response = await client.models.list()

  // Venice returns text, image, and embedding models in one list. Filter to
  // chat-capable entries so the dropdown isn't a wall of irrelevant ids:
  // when the response carries a `type`, keep only text models; anything
  // without a recognisable type is kept (fail open rather than hide a model
  // the user expects).
  const isTextModel = (entry: { id: string } & Record<string, unknown>) =>
    typeof entry.type !== 'string' || entry.type === 'text'

  const byId = new Map<string, ProviderModel>()
  for (const m of response.data) {
    const entry = m as unknown as { id: string } & Record<string, unknown>
    if (!isTextModel(entry)) continue
    byId.set(m.id, { id: m.id, displayName: m.id, contextTokens: contextTokensFor(entry) })
  }
  // Merge the curated list so the support matrix is always selectable even
  // when the live response omits it.
  for (const id of VENICE_KNOWN_MODELS) {
    if (!byId.has(id)) byId.set(id, { id, displayName: id })
  }

  const filtered = [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
  console.log('[venice] fetchModels: total', response.data.length, '| with curated merge', filtered.length)
  return filtered
}

export async function sendMessage(
  apiKey: string,
  model: string,
  system: string,
  messages: Message[],
  maxTokens: number = 500,
  signal?: AbortSignal,
): Promise<string> {
  console.log('[venice] sendMessage: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
  try {
    const client = getClient(apiKey)
    const response = await client.chat.completions.create(
      {
        model,
        messages: buildMessages(system, messages),
        max_tokens: maxTokens,
      },
      { signal },
    )
    const text = response.choices[0]?.message?.content ?? ''
    console.log('[venice] sendMessage: response', text.length, 'chars | finish_reason', response.choices[0]?.finish_reason)
    return text
  } catch (error) {
    throw toLlmError(error)
  }
}

export async function sendMessageStreaming(
  apiKey: string,
  model: string,
  system: string,
  messages: Message[],
  maxTokens: number,
  onProgress: (charsReceived: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  console.log('[venice] sendMessageStreaming: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
  let fullText = ''
  try {
    const client = getClient(apiKey)
    const stream = await client.chat.completions.create(
      {
        model,
        messages: buildMessages(system, messages),
        max_tokens: maxTokens,
        stream: true,
      },
      { signal },
    )
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        fullText += delta
        onProgress(fullText.length)
      }
    }
    console.log('[venice] sendMessageStreaming: complete —', fullText.length, 'chars')
    return fullText
  } catch (error) {
    throw toLlmError(error)
  }
}

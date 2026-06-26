import Anthropic from '@anthropic-ai/sdk'
import { LlmError, LLM_ERROR_MESSAGES } from './llm'

let clientInstance: Anthropic | null = null
let currentApiKey = ''

/**
 * Ephemeral (5-minute) cache marker. A chat re-sends the same large system
 * prompt and the same growing history on every turn, so caching the prefix
 * means each turn only pays full input price for the newest user message and
 * the reply — the rest is served at ~0.1x. The 5-minute TTL is refreshed on
 * every turn, so it stays warm throughout an active conversation.
 */
const CACHE_CONTROL = { type: 'ephemeral' } as const

/**
 * Build the cached `system` + `messages` for a chat request. Two prefix
 * breakpoints (max is 4):
 *   1. the system block — the session-stable preamble (therapy prompt +
 *      profile + index + focused entry), read on every follow-up turn;
 *   2. the last message — the multi-turn pattern: each turn writes a cache
 *      entry covering `system + history + new message`, the next turn reads it.
 * Non-final messages keep plain-string content (no marker).
 */
function buildCachedRequest(
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): { system: Anthropic.TextBlockParam[]; messages: Anthropic.MessageParam[] } {
  const cachedSystem: Anthropic.TextBlockParam[] = [
    { type: 'text', text: system, cache_control: CACHE_CONTROL },
  ]
  const lastIndex = messages.length - 1
  const cachedMessages: Anthropic.MessageParam[] = messages.map((m, i) =>
    i === lastIndex
      ? { role: m.role, content: [{ type: 'text', text: m.content, cache_control: CACHE_CONTROL }] }
      : { role: m.role, content: m.content },
  )
  return { system: cachedSystem, messages: cachedMessages }
}

export function getClient(apiKey: string): Anthropic {
  if (clientInstance && currentApiKey === apiKey) {
    console.log('[anthropic] getClient: reusing existing client')
    return clientInstance
  }
  console.log('[anthropic] getClient: creating new client instance')
  clientInstance = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  currentApiKey = apiKey
  return clientInstance
}

/**
 * Translate Anthropic SDK errors into the dispatcher's LlmError shape so the
 * UI can surface curated copy from LLM_ERROR_MESSAGES instead of raw API
 * messages — same contract as the OpenAI and local providers. Detection is
 * duck-typed on `status` (the SDK's APIError carries it) rather than
 * `instanceof` so it survives SDK module mocking in tests.
 */
function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error
  const status = (error as { status?: unknown } | null)?.status
  const message = error instanceof Error ? error.message : String(error)
  if (typeof status === 'number') {
    if (status === 401) {
      return new LlmError('INVALID_API_KEY', "Your Anthropic API key isn't valid. Update it in Settings.", error)
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

export async function streamChatResponse(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxTokens: number,
  onChunk: (fullText: string) => void,
  onComplete: (fullText: string) => void,
  onError: (error: Error) => void,
): Promise<void> {
  console.log('[anthropic] streamChatResponse: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
  try {
    const client = getClient(apiKey)
    const cached = buildCachedRequest(system, messages)
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: cached.system,
      messages: cached.messages,
    })

    let fullText = ''

    stream.on('text', (text) => {
      fullText += text
      onChunk(fullText)
    })

    stream.on('finalMessage', (message) => {
      const usage = message?.usage
      if (usage) {
        console.log(
          '[anthropic] streamChatResponse: cache —',
          'read', usage.cache_read_input_tokens ?? 0,
          '| write', usage.cache_creation_input_tokens ?? 0,
          '| uncached input', usage.input_tokens,
        )
      }
      console.log('[anthropic] streamChatResponse: complete —', fullText.length, 'chars received')
      onComplete(fullText)
    })

    stream.on('error', (error) => {
      console.error('[anthropic] streamChatResponse: stream error —', error instanceof Error ? error.message : String(error))
      onError(toLlmError(error))
    })
  } catch (error) {
    console.error('[anthropic] streamChatResponse: setup error —', error instanceof Error ? error.message : String(error))
    onError(toLlmError(error))
  }
}

export async function fetchModels(apiKey: string): Promise<{ id: string; displayName: string }[]> {
  console.log('[anthropic] fetchModels: requesting model list')
  const client = getClient(apiKey)
  const response = await client.models.list({ limit: 100 })
  const filtered = response.data
    .filter((m) => m.id.startsWith('claude-'))
    .map((m) => ({ id: m.id, displayName: m.display_name ?? m.id }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  console.log('[anthropic] fetchModels: total', response.data.length, '| after claude filter', filtered.length)
  return filtered
}

export async function sendMessage(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxTokens: number = 500,
  signal?: AbortSignal,
): Promise<string> {
  console.log('[anthropic] sendMessage: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
  try {
    const client = getClient(apiKey)
    const response = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages,
      },
      { signal },
    )
    const block = response.content[0]
    const text = block?.type === 'text' ? block.text : ''
    console.log('[anthropic] sendMessage: response', text.length, 'chars | stop_reason', response.stop_reason)
    return text
  } catch (error) {
    throw toLlmError(error)
  }
}

export async function sendMessageStreaming(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxTokens: number,
  onProgress: (charsReceived: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  console.log('[anthropic] sendMessageStreaming: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
  try {
    const client = getClient(apiKey)
    const stream = client.messages.stream(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages,
      },
      { signal },
    )

    let fullText = ''
    stream.on('text', (text) => {
      fullText += text
      onProgress(fullText.length)
    })

    await stream.finalMessage()
    console.log('[anthropic] sendMessageStreaming: complete —', fullText.length, 'chars')
    return fullText
  } catch (error) {
    throw toLlmError(error)
  }
}

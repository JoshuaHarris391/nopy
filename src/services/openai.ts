import OpenAI, { APIError } from 'openai'
import { LlmError, LLM_ERROR_MESSAGES } from './llm'

let clientInstance: OpenAI | null = null
let currentApiKey = ''

export function getClient(apiKey: string): OpenAI {
  if (clientInstance && currentApiKey === apiKey) {
    console.log('[openai] getClient: reusing existing client')
    return clientInstance
  }
  console.log('[openai] getClient: creating new client instance')
  clientInstance = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  currentApiKey = apiKey
  return clientInstance
}

type Message = { role: 'user' | 'assistant'; content: string }

/**
 * Translate OpenAI SDK errors into the dispatcher's LlmError shape so the
 * UI can surface curated copy from LLM_ERROR_MESSAGES instead of raw API
 * messages. Only the codes already used by the Anthropic/Local branches
 * are mapped here — anything else falls through to UNKNOWN.
 */
function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error
  if (error instanceof APIError) {
    if (error.status === 401) {
      return new LlmError('INVALID_API_KEY', "Your OpenAI API key isn't valid. Update it in Settings.", error)
    }
    if (error.status === 429) {
      return new LlmError('RATE_LIMITED', LLM_ERROR_MESSAGES.RATE_LIMITED, error)
    }
    if (error.status === 400 && /context|maximum.*token|too\s*long/i.test(error.message)) {
      return new LlmError('CONTEXT_TOO_LARGE', LLM_ERROR_MESSAGES.CONTEXT_TOO_LARGE, error)
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return new LlmError('UNKNOWN', message, error)
}

/**
 * Build the messages array OpenAI's Chat Completions API expects.
 * The Anthropic SDK takes `system` as a top-level argument; OpenAI takes it
 * as the first message with role `system`. The UI passes `system` as a
 * separate string in both cases — we adapt the shape here.
 */
function buildMessages(system: string, messages: Message[]) {
  const out: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages) out.push({ role: m.role, content: m.content })
  return out
}

export async function streamChatResponse(
  apiKey: string,
  model: string,
  system: string,
  messages: Message[],
  maxTokens: number,
  onChunk: (fullText: string) => void,
  onComplete: (fullText: string) => void,
  onError: (error: Error) => void,
): Promise<void> {
  console.log('[openai] streamChatResponse: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
  let fullText = ''
  try {
    const client = getClient(apiKey)
    const stream = await client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: buildMessages(system, messages),
      stream: true,
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        fullText += delta
        onChunk(fullText)
      }
    }
    console.log('[openai] streamChatResponse: complete —', fullText.length, 'chars received')
    onComplete(fullText)
  } catch (error) {
    console.error('[openai] streamChatResponse: stream error —', error instanceof Error ? error.message : String(error))
    onError(toLlmError(error))
  }
}

export async function fetchModels(apiKey: string): Promise<{ id: string; displayName: string }[]> {
  console.log('[openai] fetchModels: requesting model list')
  const client = getClient(apiKey)
  const response = await client.models.list()
  // OpenAI returns embeddings, audio, image, and chat models in one list.
  // Filter to chat-capable model families so the dropdown isn't a wall of
  // irrelevant ids. Catches the gpt-* line plus the o-series reasoning
  // models (o1, o3, etc.) without baking in a hard allowlist that would
  // break every time OpenAI ships a new model name.
  const chatLike = (id: string) => /^(gpt-|o\d)/i.test(id) && !/-(audio|image|tts|whisper|embedding|moderation|search)/i.test(id)
  const filtered = response.data
    .filter((m) => chatLike(m.id))
    .map((m) => ({ id: m.id, displayName: m.id }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  console.log('[openai] fetchModels: total', response.data.length, '| after chat filter', filtered.length)
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
  console.log('[openai] sendMessage: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
  try {
    const client = getClient(apiKey)
    const response = await client.chat.completions.create(
      {
        model,
        max_completion_tokens: maxTokens,
        messages: buildMessages(system, messages),
      },
      { signal },
    )
    const text = response.choices[0]?.message?.content ?? ''
    console.log('[openai] sendMessage: response', text.length, 'chars | finish_reason', response.choices[0]?.finish_reason)
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
  console.log('[openai] sendMessageStreaming: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
  let fullText = ''
  try {
    const client = getClient(apiKey)
    const stream = await client.chat.completions.create(
      {
        model,
        max_completion_tokens: maxTokens,
        messages: buildMessages(system, messages),
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
    console.log('[openai] sendMessageStreaming: complete —', fullText.length, 'chars')
    return fullText
  } catch (error) {
    throw toLlmError(error)
  }
}

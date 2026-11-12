import * as anthropic from './anthropic'
import * as localServer from './localServer'
import * as openai from './openai'
import * as venice from './venice'
import type { LlmConfig, LlmModelRole } from '../types/settings'
import type { ChatUsage } from '../types/chat'
import type { ProviderModel } from './models'

export type { LlmConfig, LlmModelRole } from '../types/settings'

/**
 * Every error raised inside the LLM dispatcher boundary is an `LlmError`
 * with a stable code. UI surfaces look up `LLM_ERROR_MESSAGES[code]` for
 * user-facing copy. Adding a new failure mode is a one-line change here
 * plus a one-line addition to the message map.
 */
export type LlmErrorCode =
  | 'CONNECTION_REFUSED'
  | 'TIMEOUT'
  | 'NO_MODEL_LOADED'
  | 'MODEL_NAME_MISMATCH'
  | 'NO_MODEL_CONFIGURED'
  | 'INVALID_API_KEY'
  | 'RATE_LIMITED'
  | 'CONTEXT_TOO_LARGE'
  | 'OUTPUT_TRUNCATED'
  | 'OUTPUT_CAP_REJECTED'
  | 'REFUSED'
  | 'UNKNOWN'

export class LlmError extends Error {
  code: LlmErrorCode
  cause?: unknown
  constructor(code: LlmErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'LlmError'
    this.code = code
    this.cause = cause
  }
}

/**
 * Single source of truth for user-facing error copy. Both ChatView (chat
 * send failures) and ApiSection (status indicator + onboarding card) read
 * from this map so error language stays consistent across the app.
 *
 * For dynamic messages (e.g. `MODEL_NAME_MISMATCH` listing the loaded
 * models), pass the formatted string into the LlmError constructor — the
 * map is the *fallback*, not the authoritative copy.
 */
export const LLM_ERROR_MESSAGES: Record<LlmErrorCode, string> = {
  CONNECTION_REFUSED:
    "Couldn't reach your local AI. Open LM Studio and click Start Server in the Developer tab.",
  TIMEOUT:
    "Local AI didn't respond in time. Make sure LM Studio is running and a model is loaded.",
  NO_MODEL_LOADED:
    "LM Studio is running but no model is loaded. Open LM Studio, search for a model (e.g. Gemma 4), click Download, then Load.",
  MODEL_NAME_MISMATCH:
    "The model name in Settings doesn't match any model loaded in LM Studio. Update the model name or load that model in LM Studio.",
  NO_MODEL_CONFIGURED:
    'Pick a local model in Settings before sending a message.',
  INVALID_API_KEY:
    "Your API key isn't valid. Update it in Settings.",
  RATE_LIMITED:
    'Too many requests. Wait a moment and try again.',
  CONTEXT_TOO_LARGE:
    "Your prompt is too large for this model's context window. In LM Studio, click Eject and re-load the model with a larger Context Length (Tools → Model loader). For long journal sessions, load a model with at least 32k context.",
  OUTPUT_TRUNCATED:
    'The model ran out of output tokens before it finished its answer.',
  OUTPUT_CAP_REJECTED:
    "This model's output limit is lower than the task needs. Choose a different model in Settings → AI Provider.",
  REFUSED:
    'The model declined to answer this request.',
  UNKNOWN:
    'Something went wrong with the AI request. Check the console for details.',
}

export type Message = { role: 'user' | 'assistant'; content: string }

/**
 * True when a provider's error says the *output cap we asked for* is more
 * than the model allows, e.g. Anthropic's "max_tokens: 8000 > 4096, which is
 * the maximum allowed number of output tokens for ..." or OpenAI's
 * "max_tokens is too large: 8000. This model supports at most 4096
 * completion tokens". Each provider's error translator calls this before its
 * context-overflow check, because these messages also talk about maximum
 * tokens. An error that mentions the context window is left to that check:
 * there the prompt is too long, and a smaller cap alone may not fix it.
 */
export function isOutputCapRejection(status: unknown, message: string): boolean {
  if (status !== 400 && status !== 422) return false
  if (/context/i.test(message)) return false
  return /max_(completion_)?tokens|(output|completion) tokens/i.test(message)
}

/**
 * The cap a one-shot request is retried at when the provider rejects the one
 * it asked for. 4,096 is the output limit of the older small models (Claude
 * 3 Haiku, gpt-3.5-turbo, gpt-4-turbo), so it is the largest value they all
 * accept.
 */
export const FALLBACK_OUTPUT_CAP = 4096

/**
 * Models that rejected a requested cap this session (`provider:model` → the
 * cap that worked). Remembered so an indexing run pays for the rejected
 * request once, not once per entry.
 */
const reducedOutputCaps = new Map<string, number>()

/** Test helper: forget every remembered cap. */
export function resetOutputCaps(): void {
  reducedOutputCaps.clear()
}

const tokens = (n: number) => n.toLocaleString('en-US')
const CHOOSE_ANOTHER = 'Choose a different model in Settings → AI Provider.'

/** What the provider itself said, when the translated error kept it. */
function providerDetail(e: LlmError): string {
  const cause = e.cause as { message?: unknown; body?: unknown } | null | undefined
  const raw = typeof cause?.message === 'string' ? cause.message : typeof cause?.body === 'string' ? cause.body : ''
  const text = raw.replace(/\s+/g, ' ').trim()
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

/**
 * Rewrite an output-limit failure so it names the model, the limit that
 * applied, and what to do about it. The provider modules only know "the cap
 * was rejected" or "the answer was cut off"; the dispatcher knows which
 * model was asked and how much room it was given. Other errors pass through.
 */
function explainOutputLimit(e: unknown, model: string, cap: number, requested: number): unknown {
  if (!(e instanceof LlmError)) return e
  if (e.code === 'OUTPUT_CAP_REJECTED') {
    const detail = providerDetail(e)
    return new LlmError(
      'OUTPUT_CAP_REJECTED',
      `"${model}" cannot be used for this task: the provider refused an output limit of ${tokens(cap)} tokens, so this model's own limit is lower than the answer needs. ${CHOOSE_ANOTHER}${detail ? ` Provider message: ${detail}` : ''}`,
      e,
    )
  }
  if (e.code === 'OUTPUT_TRUNCATED') {
    return new LlmError(
      'OUTPUT_TRUNCATED',
      cap < requested
        ? `"${model}" allows at most ${tokens(cap)} output tokens per response (the provider refused the ${tokens(requested)} this task asks for), and that was not enough to finish the answer. Choose a model with a larger output limit in Settings → AI Provider.`
        : `"${model}" used all ${tokens(cap)} output tokens it was allowed before finishing its answer. If this keeps happening, choose a different model in Settings → AI Provider.`,
      e,
    )
  }
  return e
}

/**
 * Readiness gate shared by every AI-using surface (ChatView, ProfileView,
 * EntryEditor, IndexView, MaintenanceSection). Anthropic needs an apiKey;
 * OpenAI needs both openaiApiKey + openaiModel; Local needs a localModel
 * name. UIs hide AI actions when this is false — friendlier than showing a
 * button guaranteed to throw NO_MODEL_CONFIGURED.
 */
export function isLlmConfigured(config: LlmConfig): boolean {
  if (config.provider === 'anthropic') return !!config.apiKey
  if (config.provider === 'openai') return !!config.openaiApiKey && !!config.openaiModel
  if (config.provider === 'venice') return !!config.veniceApiKey && !!config.veniceModel
  return !!config.localModel
}

/**
 * Maps `(provider, role)` to the configured model id. For local/openai a
 * blank lightweight slot transparently falls back to the main slot — this
 * is the "I only run one model" escape hatch, important for LM Studio users
 * since LM Studio loads one model at a time. Anthropic's lightweight slot
 * is migration-seeded with Haiku so it's never blank in practice.
 *
 * Throws `NO_MODEL_CONFIGURED` only when the *main* slot is empty and there
 * is therefore no fallback either.
 */
export function resolveModel(config: LlmConfig, role: LlmModelRole): string {
  if (config.provider === 'local') {
    const m = role === 'main' ? config.localModel : (config.localLightweightModel || config.localModel)
    if (!m) throw new LlmError('NO_MODEL_CONFIGURED', LLM_ERROR_MESSAGES.NO_MODEL_CONFIGURED)
    return m
  }
  if (config.provider === 'openai') {
    const m = role === 'main' ? config.openaiModel : (config.openaiLightweightModel || config.openaiModel)
    if (!m) throw new LlmError('NO_MODEL_CONFIGURED', LLM_ERROR_MESSAGES.NO_MODEL_CONFIGURED)
    return m
  }
  if (config.provider === 'venice') {
    const m = role === 'main' ? config.veniceModel : (config.veniceLightweightModel || config.veniceModel)
    if (!m) throw new LlmError('NO_MODEL_CONFIGURED', LLM_ERROR_MESSAGES.NO_MODEL_CONFIGURED)
    return m
  }
  const m = role === 'main' ? config.anthropicMainModel : config.anthropicLightweightModel
  if (!m) throw new LlmError('NO_MODEL_CONFIGURED', LLM_ERROR_MESSAGES.NO_MODEL_CONFIGURED)
  return m
}

/**
 * Best-effort display name lookup for a resolved model id. Calls the
 * provider's models endpoint and returns the display name from the live
 * list; falls back to the raw model id on any failure (network, auth, etc).
 *
 * Used by phase-string UI (`profileStore`) so users see the model they
 * picked in Settings rather than a hardcoded "Haiku" / "Opus" label.
 * Phase strings must never block on this lookup — hence the try/catch.
 */
export async function getResolvedModelLabel(config: LlmConfig, role: LlmModelRole): Promise<string> {
  const id = resolveModel(config, role)
  try {
    const models = await fetchModels(config)
    const match = models.find((m) => m.id === id)
    return match?.displayName ?? id
  } catch {
    return id
  }
}

export async function streamChatResponse(
  config: LlmConfig,
  role: LlmModelRole,
  system: string,
  messages: Message[],
  maxTokens: number,
  onChunk: (fullText: string) => void,
  onComplete: (fullText: string, usage?: ChatUsage) => void,
  onError: (error: Error) => void,
  /**
   * Optional provider routing hint. Only Venice uses it (`prompt_cache_key`):
   * repeating one key across a conversation's turns biases the service toward
   * the backend that already holds the cached prefix. Other providers ignore it.
   */
  promptCacheKey?: string,
): Promise<void> {
  let model: string
  try {
    model = resolveModel(config, role)
  } catch (e) {
    onError(e as Error)
    return
  }
  if (config.provider === 'local') {
    return localServer.streamChatResponse(
      config.localBaseUrl, model, system, messages, maxTokens,
      onChunk, onComplete, onError,
    )
  }
  if (config.provider === 'openai') {
    return openai.streamChatResponse(
      config.openaiApiKey, model, system, messages, maxTokens,
      onChunk, onComplete, onError,
    )
  }
  if (config.provider === 'venice') {
    return venice.streamChatResponse(
      config.veniceApiKey, model, system, messages, maxTokens,
      onChunk, onComplete, onError, promptCacheKey,
    )
  }
  return anthropic.streamChatResponse(
    config.apiKey, model, system, messages, maxTokens,
    onChunk, onComplete, onError,
  )
}

/**
 * One-shot request (entry indexing, chat titles).
 *
 * The caps these tasks ask for leave room for thinking, which is more than
 * some older or smaller models can output at all; such a model rejects the
 * request outright. When that happens the request is retried once at
 * FALLBACK_OUTPUT_CAP and the lower cap is remembered for that model, so the
 * model keeps working if the answer fits. If it does not fit, or the model
 * rejects the fallback too, the error says which model, which limit, and to
 * pick a different one.
 */
export async function sendMessage(
  config: LlmConfig,
  role: LlmModelRole,
  system: string,
  messages: Message[],
  maxTokens: number = 500,
  signal?: AbortSignal,
): Promise<string> {
  const model = resolveModel(config, role)
  const send = (cap: number): Promise<string> => {
    if (config.provider === 'local') {
      return localServer.sendMessage(config.localBaseUrl, model, system, messages, cap, signal)
    }
    if (config.provider === 'openai') {
      return openai.sendMessage(config.openaiApiKey, model, system, messages, cap, signal)
    }
    if (config.provider === 'venice') {
      return venice.sendMessage(config.veniceApiKey, model, system, messages, cap, signal)
    }
    return anthropic.sendMessage(config.apiKey, model, system, messages, cap, signal)
  }

  const key = `${config.provider}:${model}`
  const cap = Math.min(maxTokens, reducedOutputCaps.get(key) ?? maxTokens)
  try {
    return await send(cap)
  } catch (e) {
    const rejected = e instanceof LlmError && e.code === 'OUTPUT_CAP_REJECTED'
    if (!rejected || cap <= FALLBACK_OUTPUT_CAP) throw explainOutputLimit(e, model, cap, maxTokens)
    console.warn('[llm] sendMessage:', model, 'rejected an output cap of', cap, '— retrying at', FALLBACK_OUTPUT_CAP)
    reducedOutputCaps.set(key, FALLBACK_OUTPUT_CAP)
    try {
      return await send(FALLBACK_OUTPUT_CAP)
    } catch (retryError) {
      throw explainOutputLimit(retryError, model, FALLBACK_OUTPUT_CAP, maxTokens)
    }
  }
}

export async function sendMessageStreaming(
  config: LlmConfig,
  role: LlmModelRole,
  system: string,
  messages: Message[],
  maxTokens: number,
  onProgress: (charsReceived: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const model = resolveModel(config, role)
  if (config.provider === 'local') {
    return localServer.sendMessageStreaming(config.localBaseUrl, model, system, messages, maxTokens, onProgress, signal)
  }
  if (config.provider === 'openai') {
    return openai.sendMessageStreaming(config.openaiApiKey, model, system, messages, maxTokens, onProgress, signal)
  }
  if (config.provider === 'venice') {
    return venice.sendMessageStreaming(config.veniceApiKey, model, system, messages, maxTokens, onProgress, signal)
  }
  return anthropic.sendMessageStreaming(config.apiKey, model, system, messages, maxTokens, onProgress, signal)
}

export async function fetchModels(config: LlmConfig): Promise<ProviderModel[]> {
  if (config.provider === 'local') {
    return localServer.fetchModels(config.localBaseUrl)
  }
  if (config.provider === 'openai') {
    return openai.fetchModels(config.openaiApiKey)
  }
  if (config.provider === 'venice') {
    return venice.fetchModels(config.veniceApiKey)
  }
  return anthropic.fetchModels(config.apiKey)
}

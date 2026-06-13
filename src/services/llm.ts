import * as anthropic from './anthropic'
import * as localServer from './localServer'
import * as openai from './openai'
import type { LlmConfig, LlmModelRole } from '../types/settings'

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
  UNKNOWN:
    'Something went wrong with the AI request. Check the console for details.',
}

type Message = { role: 'user' | 'assistant'; content: string }

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
  onComplete: (fullText: string) => void,
  onError: (error: Error) => void,
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
  return anthropic.streamChatResponse(
    config.apiKey, model, system, messages, maxTokens,
    onChunk, onComplete, onError,
  )
}

export async function sendMessage(
  config: LlmConfig,
  role: LlmModelRole,
  system: string,
  messages: Message[],
  maxTokens: number = 500,
  signal?: AbortSignal,
): Promise<string> {
  const model = resolveModel(config, role)
  if (config.provider === 'local') {
    return localServer.sendMessage(config.localBaseUrl, model, system, messages, maxTokens, signal)
  }
  if (config.provider === 'openai') {
    return openai.sendMessage(config.openaiApiKey, model, system, messages, maxTokens, signal)
  }
  return anthropic.sendMessage(config.apiKey, model, system, messages, maxTokens, signal)
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
  return anthropic.sendMessageStreaming(config.apiKey, model, system, messages, maxTokens, onProgress, signal)
}

export async function fetchModels(config: LlmConfig): Promise<{ id: string; displayName: string }[]> {
  if (config.provider === 'local') {
    return localServer.fetchModels(config.localBaseUrl)
  }
  if (config.provider === 'openai') {
    return openai.fetchModels(config.openaiApiKey)
  }
  return anthropic.fetchModels(config.apiKey)
}

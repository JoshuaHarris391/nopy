import type { TherapyType } from '../services/prompts/therapists'

export type LlmProvider = 'anthropic' | 'local' | 'openai'

/**
 * Which slot the dispatcher should resolve.
 * - `main`     — chat replies, full psychological profile
 * - `lightweight` — per-entry indexing, summary profile, chat title gen
 *
 * Callers pass a role; `services/llm.ts:resolveModel` maps `(provider, role)`
 * to the configured model id from `LlmConfig`. This keeps Anthropic-specific
 * model ids (Haiku/Opus) out of call sites and lets every provider expose
 * the same two slots in Settings.
 */
export type LlmModelRole = 'main' | 'lightweight'

/**
 * Slice consumed by the dispatcher in `services/llm.ts`. Kept narrow so
 * call sites re-render only when LLM-relevant settings change.
 *
 * Field naming maps to per-provider Settings UI: each provider has a
 * `*MainModel` slot (chat + full profile) and a `*LightweightModel` slot
 * (indexing, summary, title). For local/openai a blank lightweight slot
 * transparently falls back to the main model — see `resolveModel`.
 */
export interface LlmConfig {
  provider: LlmProvider
  apiKey: string
  anthropicMainModel: string
  anthropicLightweightModel: string
  localBaseUrl: string
  localModel: string
  localLightweightModel: string
  openaiApiKey: string
  openaiModel: string
  openaiLightweightModel: string
}

export interface UserSettings {
  apiKey: string
  preferredModel: string
  anthropicLightweightModel: string
  maxOutputTokens: number
  contextBudget: number
  /**
   * How many recent indexed journal entries to include in the Journal Index
   * context card / system prompt. `0` means "all" (no cap). Default 30.
   */
  journalIndexLimit: number
  /**
   * Manual override (in tokens) for the model's context window, used as the
   * denominator of the Context Workspace budget bar. `null` = auto-detect
   * (LM Studio's reported window, or the static map for hosted models).
   */
  modelContextWindowOverride: number | null
  onboardingComplete: boolean
  sidebarCollapsed: boolean
  sessionPanelCollapsed: boolean
  journalPath: string
  theme: 'light' | 'dark' | 'system'
  therapyType: TherapyType
  provider: LlmProvider
  localBaseUrl: string
  localModel: string
  localLightweightModel: string
  openaiApiKey: string
  openaiModel: string
  openaiLightweightModel: string
}

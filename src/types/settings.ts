import type { TherapyType } from '../services/prompts/therapists'
import type { ProfileScope } from './profile'

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
 * One entry in the journal launcher's "recently used" list. `name` is the
 * folder's display name (its basename, derived once when recorded) so the
 * launcher can render the list without touching the filesystem; `path` is the
 * absolute folder path used to switch into the journal; `lastOpenedAt` is an
 * ISO timestamp used to order the list most-recent-first.
 */
export interface RecentJournal {
  path: string
  name: string
  lastOpenedAt: string
}

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
  /**
   * Show cumulative billed token usage (input/output, plus cached when prompt
   * caching is active) in the chat header so users can estimate cost. Off by
   * default; only populated for Anthropic, which returns billed usage.
   */
  showTokenUsage: boolean
  /**
   * Journal-only mode. Hides every AI surface (chat, context, profile, index,
   * provider settings) and short-circuits indexing and profile generation so
   * nothing can reach an LLM provider while it is on. Off by default.
   */
  privateMode: boolean
  /**
   * How the full psychological profile is (re)generated. `incremental`
   * (default) sends the previous profile plus only the index records added
   * since; `full` rewrites from every record each time.
   */
  profileGenerationMode: 'incremental' | 'full'
  /**
   * Which index records feed profile generation: every indexed entry, the
   * newest N entries, or the last N calendar months. Chosen on the Profile
   * page beside Generate.
   */
  profileScope: ProfileScope
  journalPath: string
  /**
   * Journals the user has created or opened, most-recent-first. Surfaced as
   * quick-pick suggestions in the journal launcher shown on every app start.
   */
  recentJournals: RecentJournal[]
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

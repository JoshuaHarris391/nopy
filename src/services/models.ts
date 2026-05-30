import type { LlmConfig } from '../types/settings'

// Seed values for the Anthropic provider's main and lightweight model
// slots. Used by `settingsStore` defaults and the v3 migration. After
// initial setup the user picks any other model from the live model list.
export const DEFAULT_ANTHROPIC_MAIN_MODEL = 'claude-sonnet-4-5-20250514'
export const DEFAULT_ANTHROPIC_LIGHTWEIGHT_MODEL = 'claude-haiku-4-5-20251001'

export const TOKEN_LIMITS = {
  entryMetadata: 500,
  profileNarrative: 4000,
  fullProfile: 10000,
  titleGeneration: 50,
} as const

/**
 * Best-effort static context windows for hosted models, used as the
 * denominator of the Context Workspace budget bar. MUST have a safe fallback —
 * model ids drift and new ones ship constantly. Local (LM Studio) reports its
 * real window at runtime, so it isn't listed here.
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic (representative — extend as new models ship)
  'claude-sonnet-4-5-20250514': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  'claude-opus-4-6': 200_000,
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4-5': 200_000,
  // OpenAI (representative)
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4.1': 1_000_000,
  'gpt-4.1-mini': 1_000_000,
}

/** Fallback windows when a hosted model id isn't in the map above. */
export const DEFAULT_CONTEXT_WINDOW = {
  anthropic: 200_000,
  openai: 128_000,
  local: 8_192, // conservative; LM Studio usually reports the real value
} as const

/** Minimal shape from `useLocalModels` needed to read a loaded window. */
export interface LocalModelWindow {
  id: string
  loadedContextLength: number | null
  maxContextLength: number | null
}

/**
 * Resolve the active model's context window (in tokens) for the budget bar and
 * the window-aware message budget. Priority:
 *   1. `override` — the user's manual value always wins.
 *   2. local mode — the loaded window LM Studio reports.
 *   3. `catalogWindow` — the real window from the LiteLLM dataset (see
 *      `modelCatalogStore`), resolved by the caller for the active hosted model.
 *   4. the static `MODEL_CONTEXT_WINDOWS` map — offline / pre-fetch fallback.
 *   5. a safe provider default.
 */
export function getModelContextWindow(
  config: LlmConfig,
  localModels?: LocalModelWindow[],
  override?: number | null,
  catalogWindow?: number,
): { tokens: number; source: 'detected' | 'default' | 'manual' } {
  if (override && override > 0) return { tokens: override, source: 'manual' }

  if (config.provider === 'local') {
    const m = localModels?.find((x) => x.id === config.localModel)
    const t = m?.loadedContextLength ?? m?.maxContextLength
    return t ? { tokens: t, source: 'detected' } : { tokens: DEFAULT_CONTEXT_WINDOW.local, source: 'default' }
  }

  if (catalogWindow && catalogWindow > 0) return { tokens: catalogWindow, source: 'detected' }

  const id = config.provider === 'openai' ? config.openaiModel : config.anthropicMainModel
  const t = MODEL_CONTEXT_WINDOWS[id]
  return t ? { tokens: t, source: 'detected' } : { tokens: DEFAULT_CONTEXT_WINDOW[config.provider], source: 'default' }
}

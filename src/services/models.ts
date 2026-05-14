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

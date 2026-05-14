import type { TherapyType } from '../services/prompts/therapists'

export type LlmProvider = 'anthropic' | 'local' | 'openai'

/**
 * Slice consumed by the dispatcher in `services/llm.ts`. Kept narrow so
 * call sites re-render only when LLM-relevant settings change.
 */
export interface LlmConfig {
  provider: LlmProvider
  apiKey: string
  localBaseUrl: string
  localModel: string
  openaiApiKey: string
  openaiModel: string
}

export interface UserSettings {
  apiKey: string
  preferredModel: string
  maxOutputTokens: number
  contextBudget: number
  onboardingComplete: boolean
  sidebarCollapsed: boolean
  sessionPanelCollapsed: boolean
  journalPath: string
  theme: 'light' | 'dark' | 'system'
  therapyType: TherapyType
  provider: LlmProvider
  localBaseUrl: string
  localModel: string
  openaiApiKey: string
  openaiModel: string
}

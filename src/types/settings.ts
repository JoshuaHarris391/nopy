import type { TherapyType } from '../services/prompts/therapists'

export interface UserSettings {
  apiKey: string
  preferredModel: string
  maxOutputTokens: number
  contextBudget: number
  onboardingComplete: boolean
  sidebarCollapsed: boolean
  sessionPanelCollapsed: boolean
  journalPath: string
  theme: 'light' | 'dark'
  therapyType: TherapyType
}

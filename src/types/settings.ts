export interface UserSettings {
  apiKey: string
  preferredModel: string
  maxOutputTokens: number
  contextBudget: number
  onboardingComplete: boolean
  sidebarCollapsed: boolean
  journalPath: string
  theme: 'light' | 'dark'
}

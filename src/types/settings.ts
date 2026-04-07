export interface UserSettings {
  apiKey: string
  preferredModel: string
  maxTokens: number
  onboardingComplete: boolean
  sidebarCollapsed: boolean
  journalPath: string
  theme: 'light' | 'dark'
}

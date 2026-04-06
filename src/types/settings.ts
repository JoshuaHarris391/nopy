export interface UserSettings {
  apiKey: string
  preferredModel: string
  onboardingComplete: boolean
  sidebarCollapsed: boolean
  journalPath: string
  theme: 'light' | 'dark'
}

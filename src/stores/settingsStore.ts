import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserSettings } from '../types/settings'

interface SettingsState extends UserSettings {
  setApiKey: (key: string) => void
  setPreferredModel: (model: string) => void
  completeOnboarding: () => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setMaxTokens: (tokens: number) => void
  setJournalPath: (path: string) => void
  setTheme: (theme: 'light' | 'dark') => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      preferredModel: 'claude-opus-4-6',
      maxTokens: 4096,
      onboardingComplete: false,
      sidebarCollapsed: false,
      journalPath: '',
      theme: 'light',

      setApiKey: (key) => set({ apiKey: key }),
      setPreferredModel: (model) => set({ preferredModel: model }),
      setMaxTokens: (tokens) => set({ maxTokens: tokens }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setJournalPath: (path) => set({ journalPath: path }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'nopy-settings' }
  )
)

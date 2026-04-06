import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserSettings } from '../types/settings'

interface SettingsState extends UserSettings {
  setApiKey: (key: string) => void
  setPreferredModel: (model: string) => void
  completeOnboarding: () => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      preferredModel: 'claude-opus-4-6',
      onboardingComplete: false,
      sidebarCollapsed: false,

      setApiKey: (key) => set({ apiKey: key }),
      setPreferredModel: (model) => set({ preferredModel: model }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    { name: 'nopy-settings' }
  )
)

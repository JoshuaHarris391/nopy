import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserSettings } from '../types/settings'
import { DEFAULT_THERAPY, type TherapyType } from '../services/prompts/therapists'

interface SettingsState extends UserSettings {
  setApiKey: (key: string) => void
  setPreferredModel: (model: string) => void
  completeOnboarding: () => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSessionPanel: () => void
  setSessionPanelCollapsed: (collapsed: boolean) => void
  setMaxOutputTokens: (tokens: number) => void
  setContextBudget: (tokens: number) => void
  setJournalPath: (path: string) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setTherapyType: (type: TherapyType) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      preferredModel: 'claude-sonnet-4-5-20250514',
      maxOutputTokens: 4096,
      contextBudget: 500000,
      onboardingComplete: false,
      sidebarCollapsed: false,
      sessionPanelCollapsed: false,
      journalPath: '',
      theme: 'system',
      therapyType: DEFAULT_THERAPY,

      setApiKey: (key) => set({ apiKey: key }),
      setPreferredModel: (model) => set({ preferredModel: model }),
      setMaxOutputTokens: (tokens) => set({ maxOutputTokens: tokens }),
      setContextBudget: (tokens) => set({ contextBudget: tokens }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSessionPanel: () => set((state) => ({ sessionPanelCollapsed: !state.sessionPanelCollapsed })),
      setSessionPanelCollapsed: (collapsed) => set({ sessionPanelCollapsed: collapsed }),
      setJournalPath: (path) => set({ journalPath: path }),
      setTheme: (theme) => set({ theme }),
      setTherapyType: (type) => set({ therapyType: type }),
    }),
    { name: 'nopy-settings' }
  )
)

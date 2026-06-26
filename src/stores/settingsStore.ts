import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserSettings, LlmProvider, LlmConfig } from '../types/settings'
import { recordJournalEntry } from './recentJournals'
import { DEFAULT_THERAPY, type TherapyType } from '../services/prompts/therapists'
import { DEFAULT_ANTHROPIC_MAIN_MODEL, DEFAULT_ANTHROPIC_LIGHTWEIGHT_MODEL } from '../services/models'
import { DEFAULT_JOURNAL_INDEX_LIMIT } from '../services/contextAssembler'

interface SettingsState extends UserSettings {
  setApiKey: (key: string) => void
  setPreferredModel: (model: string) => void
  setAnthropicLightweightModel: (model: string) => void
  completeOnboarding: () => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSessionPanel: () => void
  setSessionPanelCollapsed: (collapsed: boolean) => void
  setShowTokenUsage: (value: boolean) => void
  setMaxOutputTokens: (tokens: number) => void
  setContextBudget: (tokens: number) => void
  setJournalIndexLimit: (count: number) => void
  setModelContextWindowOverride: (tokens: number | null) => void
  setJournalPath: (path: string) => void
  recordJournal: (path: string) => void
  removeRecentJournal: (path: string) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setTherapyType: (type: TherapyType) => void
  setProvider: (provider: LlmProvider) => void
  setLocalBaseUrl: (url: string) => void
  setLocalModel: (model: string) => void
  setLocalLightweightModel: (model: string) => void
  setOpenaiApiKey: (key: string) => void
  setOpenaiModel: (model: string) => void
  setOpenaiLightweightModel: (model: string) => void
}

const DEFAULT_LOCAL_BASE_URL = 'http://localhost:1234/v1'

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      preferredModel: DEFAULT_ANTHROPIC_MAIN_MODEL,
      anthropicLightweightModel: DEFAULT_ANTHROPIC_LIGHTWEIGHT_MODEL,
      maxOutputTokens: 4096,
      contextBudget: 500000,
      journalIndexLimit: DEFAULT_JOURNAL_INDEX_LIMIT,
      modelContextWindowOverride: null,
      onboardingComplete: false,
      sidebarCollapsed: false,
      sessionPanelCollapsed: false,
      showTokenUsage: false,
      journalPath: '',
      recentJournals: [],
      theme: 'system',
      therapyType: DEFAULT_THERAPY,
      provider: 'anthropic',
      localBaseUrl: DEFAULT_LOCAL_BASE_URL,
      localModel: '',
      localLightweightModel: '',
      openaiApiKey: '',
      openaiModel: '',
      openaiLightweightModel: '',

      setApiKey: (key) => set({ apiKey: key }),
      setPreferredModel: (model) => set({ preferredModel: model }),
      setAnthropicLightweightModel: (model) => set({ anthropicLightweightModel: model }),
      setMaxOutputTokens: (tokens) => set({ maxOutputTokens: tokens }),
      setContextBudget: (tokens) => set({ contextBudget: tokens }),
      setJournalIndexLimit: (count) => set({ journalIndexLimit: count }),
      setModelContextWindowOverride: (tokens) => set({ modelContextWindowOverride: tokens }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSessionPanel: () => set((state) => ({ sessionPanelCollapsed: !state.sessionPanelCollapsed })),
      setSessionPanelCollapsed: (collapsed) => set({ sessionPanelCollapsed: collapsed }),
      setShowTokenUsage: (value) => set({ showTokenUsage: value }),
      setJournalPath: (path) => set({ journalPath: path }),
      recordJournal: (path) => set((state) => ({ recentJournals: recordJournalEntry(state.recentJournals, path) })),
      removeRecentJournal: (path) => set((state) => ({ recentJournals: state.recentJournals.filter((j) => j.path !== path) })),
      setTheme: (theme) => set({ theme }),
      setTherapyType: (type) => set({ therapyType: type }),
      setProvider: (provider) => set({ provider }),
      setLocalBaseUrl: (url) => set({ localBaseUrl: url }),
      setLocalModel: (model) => set({ localModel: model }),
      setLocalLightweightModel: (model) => set({ localLightweightModel: model }),
      setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
      setOpenaiModel: (model) => set({ openaiModel: model }),
      setOpenaiLightweightModel: (model) => set({ openaiLightweightModel: model }),
    }),
    {
      name: 'nopy-settings',
      version: 7,
      // v0 → v1 added the local-LLM fields (provider/localBaseUrl/localModel).
      // v1 → v2 added the OpenAI fields (openaiApiKey/openaiModel).
      // v2 → v3 added per-provider lightweight model slots. Anthropic seeds
      // to Haiku (sensible default); OpenAI/local seed blank — the dispatcher
      // falls back to the main slot when blank so users with single-model
      // setups (e.g. LM Studio) get a working zero-config experience.
      // v3 → v4 added the Context Workspace's modelContextWindowOverride
      // (null = auto-detect the model's window).
      // v4 → v5 added journalIndexLimit (how many entries the Journal Index
      // card injects; 0 = all). Seeds to the previous hardcoded default of 30.
      // v5 → v6 added recentJournals (the journal launcher's quick-pick list).
      // Existing users have a journalPath but no recents, so we seed the list
      // with their current journal — it shows up as the highlighted suggestion
      // on first launch into the new launcher. A fresh install has no persisted
      // blob, so migrate() never runs and recentJournals stays the empty default.
      // v6 → v7 added showTokenUsage (chat-header billed-token display). Seeds
      // OFF so existing users see no change until they opt in.
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<UserSettings> & Record<string, unknown>
        let next = state
        if (version < 1) {
          next = {
            ...next,
            provider: next.provider ?? 'anthropic',
            localBaseUrl: next.localBaseUrl ?? DEFAULT_LOCAL_BASE_URL,
            localModel: next.localModel ?? '',
          }
        }
        if (version < 2) {
          next = {
            ...next,
            openaiApiKey: next.openaiApiKey ?? '',
            openaiModel: next.openaiModel ?? '',
          }
        }
        if (version < 3) {
          next = {
            ...next,
            anthropicLightweightModel: next.anthropicLightweightModel ?? DEFAULT_ANTHROPIC_LIGHTWEIGHT_MODEL,
            localLightweightModel: next.localLightweightModel ?? '',
            openaiLightweightModel: next.openaiLightweightModel ?? '',
          }
        }
        if (version < 4) {
          next = {
            ...next,
            modelContextWindowOverride: next.modelContextWindowOverride ?? null,
          }
        }
        if (version < 5) {
          next = {
            ...next,
            journalIndexLimit: next.journalIndexLimit ?? DEFAULT_JOURNAL_INDEX_LIMIT,
          }
        }
        if (version < 6) {
          const jp = typeof next.journalPath === 'string' ? next.journalPath : ''
          next = {
            ...next,
            recentJournals: jp ? recordJournalEntry([], jp) : [],
          }
        }
        if (version < 7) {
          next = {
            ...next,
            showTokenUsage: next.showTokenUsage ?? false,
          }
        }
        return next
      },
    }
  )
)

/**
 * Slice consumed by `services/llm.ts` to dispatch LLM calls. The `LlmConfig`
 * type lives in `types/settings.ts` so the dispatcher can import it without
 * pulling in the full store.
 *
 * Note the rename: the persisted key is `preferredModel` (kept for backward
 * compatibility with existing user data), but it's exposed to the dispatcher
 * as `anthropicMainModel` for symmetry with the OpenAI/local main slots.
 *
 * IMPORTANT: this selector returns a fresh object on every call, so React
 * components MUST wrap it in `useShallow` to avoid an infinite re-render
 * loop:
 *
 *   import { useShallow } from 'zustand/react/shallow'
 *   const llmConfig = useSettingsStore(useShallow(selectLlmConfig))
 *
 * Plain `getState()` calls outside React (e.g. inside imperative handlers)
 * don't need useShallow — they execute once and don't trigger renders.
 */
export const selectLlmConfig = (s: SettingsState): LlmConfig => ({
  provider: s.provider,
  apiKey: s.apiKey,
  anthropicMainModel: s.preferredModel,
  anthropicLightweightModel: s.anthropicLightweightModel,
  localBaseUrl: s.localBaseUrl,
  localModel: s.localModel,
  localLightweightModel: s.localLightweightModel,
  openaiApiKey: s.openaiApiKey,
  openaiModel: s.openaiModel,
  openaiLightweightModel: s.openaiLightweightModel,
})

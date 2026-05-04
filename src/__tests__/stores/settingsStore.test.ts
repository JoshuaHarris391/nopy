import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from '../../stores/settingsStore'
import { DEFAULT_THERAPY } from '../../services/prompts/therapists'

/**
 * Defaults are duplicated here intentionally — if the store's defaults change,
 * this constant catches it instead of silently passing because the comparison
 * was self-referential.
 */
const DEFAULTS = {
  apiKey: '',
  preferredModel: 'claude-sonnet-4-5-20250514',
  maxOutputTokens: 4096,
  contextBudget: 500000,
  onboardingComplete: false,
  sidebarCollapsed: false,
  sessionPanelCollapsed: false,
  journalPath: '',
  theme: 'system' as const,
  therapyType: DEFAULT_THERAPY,
}

beforeEach(() => {
  /**
   * Reset both the in-memory store and the persisted localStorage entry so
   * tests can't bleed state. We spread defaults onto setState rather than
   * passing `replace: true` — replace mode wipes the action functions
   * attached by the persist middleware, breaking every subsequent setter
   * call in the same suite.
   */
  localStorage.clear()
  useSettingsStore.setState({ ...DEFAULTS })
})

describe('useSettingsStore', () => {
  it('initializes with the documented defaults', () => {
    /**
     * Onboarding, the chat UI, and the entry processor all read these
     * defaults on first launch. Drift here is silent until a user files a
     * bug. The persist middleware (`name: 'nopy-settings'`) writes
     * everything, so the surface to lock down is the full state shape.
     */
    const state = useSettingsStore.getState()
    for (const [key, value] of Object.entries(DEFAULTS)) {
      expect(state[key as keyof typeof DEFAULTS]).toEqual(value)
    }
  })

  it('every setter writes through and only mutates its own slice', () => {
    /**
     * One per setter, parameterized. The "only mutates its own slice"
     * guarantee matters because the upcoming `provider` field will share
     * actions with `apiKey` etc. — if `setProvider` accidentally clears
     * `apiKey`, that's exactly the regression this test catches.
     */
    const cases: { call: () => void; expectField: keyof typeof DEFAULTS; expectValue: unknown }[] = [
      { call: () => useSettingsStore.getState().setApiKey('sk-x'), expectField: 'apiKey', expectValue: 'sk-x' },
      { call: () => useSettingsStore.getState().setPreferredModel('claude-haiku-4-5'), expectField: 'preferredModel', expectValue: 'claude-haiku-4-5' },
      { call: () => useSettingsStore.getState().setMaxOutputTokens(8192), expectField: 'maxOutputTokens', expectValue: 8192 },
      { call: () => useSettingsStore.getState().setContextBudget(60000), expectField: 'contextBudget', expectValue: 60000 },
      { call: () => useSettingsStore.getState().setSidebarCollapsed(true), expectField: 'sidebarCollapsed', expectValue: true },
      { call: () => useSettingsStore.getState().setSessionPanelCollapsed(true), expectField: 'sessionPanelCollapsed', expectValue: true },
      { call: () => useSettingsStore.getState().setJournalPath('/tmp/j'), expectField: 'journalPath', expectValue: '/tmp/j' },
      { call: () => useSettingsStore.getState().setTheme('dark'), expectField: 'theme', expectValue: 'dark' },
    ]

    for (const { call, expectField, expectValue } of cases) {
      // Reset between cases so each setter is observed against a clean baseline.
      useSettingsStore.setState({ ...DEFAULTS })
      call()
      const state = useSettingsStore.getState()
      expect(state[expectField]).toEqual(expectValue)
      // Every other field should still match defaults.
      for (const [k, v] of Object.entries(DEFAULTS)) {
        if (k === expectField) continue
        expect(state[k as keyof typeof DEFAULTS]).toEqual(v)
      }
    }
  })

  it('toggleSidebar / toggleSessionPanel flip their boolean and completeOnboarding sets true', () => {
    /**
     * Toggles use the `set((state) => ...)` updater form rather than the
     * direct setter — easy to break in a refactor. completeOnboarding is
     * one-shot: once true, it stays true.
     */
    const { toggleSidebar, toggleSessionPanel, completeOnboarding } = useSettingsStore.getState()

    toggleSidebar()
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(true)
    toggleSidebar()
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(false)

    toggleSessionPanel()
    expect(useSettingsStore.getState().sessionPanelCollapsed).toBe(true)

    completeOnboarding()
    expect(useSettingsStore.getState().onboardingComplete).toBe(true)
  })

  it('persists changes to localStorage under the key "nopy-settings"', () => {
    /**
     * The persist contract: any state mutation lands in localStorage under
     * the documented key. The upcoming `provider` field will rely on this
     * same write path for cross-reload survival.
     */
    useSettingsStore.getState().setApiKey('sk-persisted')
    useSettingsStore.getState().setPreferredModel('claude-opus-4-5')

    const raw = localStorage.getItem('nopy-settings')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as { state: Record<string, unknown> }
    expect(parsed.state.apiKey).toBe('sk-persisted')
    expect(parsed.state.preferredModel).toBe('claude-opus-4-5')
  })

  it('rehydrates persisted state when the module is re-imported', async () => {
    /**
     * A hard reload (or a Tauri window restart) unloads the JS heap; the
     * store's only memory of the user's settings is what's in localStorage.
     * We seed localStorage, reset the module cache, and re-import — the
     * fresh store instance must show the seeded values, not the defaults.
     */
    localStorage.setItem(
      'nopy-settings',
      JSON.stringify({
        state: { ...DEFAULTS, apiKey: 'sk-rehydrated', preferredModel: 'claude-haiku-4-5' },
        version: 0,
      }),
    )

    vi.resetModules()
    const fresh = await import('../../stores/settingsStore')
    expect(fresh.useSettingsStore.getState().apiKey).toBe('sk-rehydrated')
    expect(fresh.useSettingsStore.getState().preferredModel).toBe('claude-haiku-4-5')
  })
})

describe('forward-looking multi-provider settings (todo)', () => {
  // Pinned for the LM Studio integration in docs/tasks/10-gemma4-local-integration.md.
  // The new `provider` field must default to 'anthropic' for existing installs
  // (so an in-place upgrade doesn't break a chat-mid-flight) and persist across
  // reloads alongside `apiKey`.
  it.todo('adding `provider` field defaults to "anthropic" for existing installs and persists across reloads')
})

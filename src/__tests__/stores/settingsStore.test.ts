import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore, selectLlmConfig } from '../../stores/settingsStore'
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
  provider: 'anthropic' as const,
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: '',
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
      { call: () => useSettingsStore.getState().setProvider('local'), expectField: 'provider', expectValue: 'local' },
      { call: () => useSettingsStore.getState().setLocalBaseUrl('http://localhost:11434/v1'), expectField: 'localBaseUrl', expectValue: 'http://localhost:11434/v1' },
      { call: () => useSettingsStore.getState().setLocalModel('google/gemma-4-e4b'), expectField: 'localModel', expectValue: 'google/gemma-4-e4b' },
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

describe('multi-provider settings', () => {
  it('defaults provider to "anthropic" so existing installs keep working in-place', () => {
    /**
     * The whole "users won't notice the upgrade" property hinges on this
     * default. Anyone shipping with `provider: 'local'` as the default would
     * silently break every existing user the moment their app updates.
     */
    expect(useSettingsStore.getState().provider).toBe('anthropic')
    expect(useSettingsStore.getState().localBaseUrl).toBe('http://localhost:1234/v1')
    expect(useSettingsStore.getState().localModel).toBe('')
  })

  it('migrates a v0 persisted blob (no provider/localBaseUrl/localModel) to v1 defaults without losing other fields', async () => {
    /**
     * Existing installs have a `nopy-settings` blob in localStorage that
     * predates the multi-provider refactor — no `provider`, no
     * `localBaseUrl`, no `localModel`. The persist middleware's `migrate`
     * function must add those fields with safe defaults (anthropic mode)
     * while preserving everything the user already configured.
     */
    localStorage.setItem(
      'nopy-settings',
      JSON.stringify({
        state: {
          apiKey: 'sk-existing',
          preferredModel: 'claude-opus-4-5',
          maxOutputTokens: 8192,
          contextBudget: 200000,
          onboardingComplete: true,
          sidebarCollapsed: false,
          sessionPanelCollapsed: false,
          journalPath: '/tmp/journal',
          theme: 'dark',
          therapyType: DEFAULTS.therapyType,
        },
        version: 0,
      }),
    )

    vi.resetModules()
    const fresh = await import('../../stores/settingsStore')
    const state = fresh.useSettingsStore.getState()

    // Pre-existing fields preserved.
    expect(state.apiKey).toBe('sk-existing')
    expect(state.preferredModel).toBe('claude-opus-4-5')
    expect(state.maxOutputTokens).toBe(8192)
    expect(state.journalPath).toBe('/tmp/journal')
    expect(state.theme).toBe('dark')
    // New fields filled in with safe defaults.
    expect(state.provider).toBe('anthropic')
    expect(state.localBaseUrl).toBe('http://localhost:1234/v1')
    expect(state.localModel).toBe('')
  })

  it('selectLlmConfig returns only the four LLM-routing fields', () => {
    /**
     * The dispatcher in services/llm.ts only needs provider + apiKey +
     * localBaseUrl + localModel. Keeping the selector narrow means call
     * sites re-render only when LLM-relevant settings change, and the
     * dispatcher's test surface stays tiny.
     */
    useSettingsStore.setState({
      apiKey: 'sk-x',
      preferredModel: 'claude-haiku-4-5',
      provider: 'local',
      localBaseUrl: 'http://localhost:11434/v1',
      localModel: 'gemma',
      theme: 'dark', // not in the slice
    })

    const config = selectLlmConfig(useSettingsStore.getState())
    expect(config).toEqual({
      provider: 'local',
      apiKey: 'sk-x',
      localBaseUrl: 'http://localhost:11434/v1',
      localModel: 'gemma',
    })
    expect(Object.keys(config).sort()).toEqual(['apiKey', 'localBaseUrl', 'localModel', 'provider'])
  })
})

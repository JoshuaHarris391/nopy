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
  anthropicLightweightModel: 'claude-haiku-4-5-20251001',
  maxOutputTokens: 4096,
  contextBudget: 500000,
  modelContextWindowOverride: null,
  onboardingComplete: false,
  sidebarCollapsed: false,
  sessionPanelCollapsed: false,
  journalPath: '',
  recentJournals: [],
  theme: 'system' as const,
  therapyType: DEFAULT_THERAPY,
  provider: 'anthropic' as const,
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: '',
  localLightweightModel: '',
  openaiApiKey: '',
  openaiModel: '',
  openaiLightweightModel: '',
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
     * guarantee matters because each provider toggle and model setter
     * shares an action surface — if `setProvider` accidentally clears
     * `apiKey`, that's exactly the regression this test catches.
     */
    const cases: { call: () => void; expectField: keyof typeof DEFAULTS; expectValue: unknown }[] = [
      { call: () => useSettingsStore.getState().setApiKey('sk-x'), expectField: 'apiKey', expectValue: 'sk-x' },
      { call: () => useSettingsStore.getState().setPreferredModel('claude-haiku-4-5'), expectField: 'preferredModel', expectValue: 'claude-haiku-4-5' },
      { call: () => useSettingsStore.getState().setAnthropicLightweightModel('claude-haiku-new'), expectField: 'anthropicLightweightModel', expectValue: 'claude-haiku-new' },
      { call: () => useSettingsStore.getState().setMaxOutputTokens(8192), expectField: 'maxOutputTokens', expectValue: 8192 },
      { call: () => useSettingsStore.getState().setContextBudget(60000), expectField: 'contextBudget', expectValue: 60000 },
      { call: () => useSettingsStore.getState().setModelContextWindowOverride(32000), expectField: 'modelContextWindowOverride', expectValue: 32000 },
      { call: () => useSettingsStore.getState().setSidebarCollapsed(true), expectField: 'sidebarCollapsed', expectValue: true },
      { call: () => useSettingsStore.getState().setSessionPanelCollapsed(true), expectField: 'sessionPanelCollapsed', expectValue: true },
      { call: () => useSettingsStore.getState().setJournalPath('/tmp/j'), expectField: 'journalPath', expectValue: '/tmp/j' },
      { call: () => useSettingsStore.getState().setTheme('dark'), expectField: 'theme', expectValue: 'dark' },
      { call: () => useSettingsStore.getState().setProvider('local'), expectField: 'provider', expectValue: 'local' },
      { call: () => useSettingsStore.getState().setLocalBaseUrl('http://localhost:11434/v1'), expectField: 'localBaseUrl', expectValue: 'http://localhost:11434/v1' },
      { call: () => useSettingsStore.getState().setLocalModel('google/gemma-4-e4b'), expectField: 'localModel', expectValue: 'google/gemma-4-e4b' },
      { call: () => useSettingsStore.getState().setLocalLightweightModel('mini-local'), expectField: 'localLightweightModel', expectValue: 'mini-local' },
      { call: () => useSettingsStore.getState().setOpenaiApiKey('sk-openai-x'), expectField: 'openaiApiKey', expectValue: 'sk-openai-x' },
      { call: () => useSettingsStore.getState().setOpenaiModel('gpt-4o-mini'), expectField: 'openaiModel', expectValue: 'gpt-4o-mini' },
      { call: () => useSettingsStore.getState().setOpenaiLightweightModel('gpt-4o-mini'), expectField: 'openaiLightweightModel', expectValue: 'gpt-4o-mini' },
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
        version: 3,
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
     * The OpenAI fields default to empty strings so the readiness gate in
     * ChatView/ProfileView/IndexView/MaintenanceSection treats a fresh
     * install as "not configured" rather than "ready to call OpenAI".
     */
    expect(useSettingsStore.getState().provider).toBe('anthropic')
    expect(useSettingsStore.getState().localBaseUrl).toBe('http://localhost:1234/v1')
    expect(useSettingsStore.getState().localModel).toBe('')
    expect(useSettingsStore.getState().openaiApiKey).toBe('')
    expect(useSettingsStore.getState().openaiModel).toBe('')
  })

  it('migrates a v0 persisted blob (no provider/localBaseUrl/localModel) through v1, v2, and v3 in one step', async () => {
    /**
     * Existing installs may have a v0 `nopy-settings` blob that predates the
     * multi-provider refactor — no provider/localBaseUrl/localModel, no
     * openaiApiKey/openaiModel, no per-provider lightweight slots. The persist
     * middleware's `migrate` runs every step in sequence, so loading a v0
     * blob should land the user on a fully-shaped v3 state with all the new
     * fields filled in safely.
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
    // v0→v1 fields filled in with safe defaults.
    expect(state.provider).toBe('anthropic')
    expect(state.localBaseUrl).toBe('http://localhost:1234/v1')
    expect(state.localModel).toBe('')
    // v1→v2 fields filled in too.
    expect(state.openaiApiKey).toBe('')
    expect(state.openaiModel).toBe('')
    // v2→v3 fields filled in. Anthropic seeds to Haiku so the lightweight
    // slot has a working default; openai/local stay blank so the dispatcher
    // falls back to the main model.
    expect(state.anthropicLightweightModel).toBe('claude-haiku-4-5-20251001')
    expect(state.localLightweightModel).toBe('')
    expect(state.openaiLightweightModel).toBe('')
  })

  it('migrates a v1 persisted blob (no openai/lightweight fields) to v3 defaults without losing other fields', async () => {
    /**
     * Users who adopted the local-LLM release have a v1 blob with provider/
     * localBaseUrl/localModel but no openai* or *lightweight fields. The
     * v1→v2 step adds the OpenAI fields, then v2→v3 adds the per-provider
     * lightweight slots, all in one rehydration pass.
     */
    localStorage.setItem(
      'nopy-settings',
      JSON.stringify({
        state: {
          apiKey: 'sk-existing',
          preferredModel: 'claude-opus-4-5',
          maxOutputTokens: 4096,
          contextBudget: 500000,
          onboardingComplete: true,
          sidebarCollapsed: false,
          sessionPanelCollapsed: false,
          journalPath: '/tmp/journal',
          theme: 'dark',
          therapyType: DEFAULTS.therapyType,
          provider: 'local',
          localBaseUrl: 'http://localhost:11434/v1',
          localModel: 'gemma',
        },
        version: 1,
      }),
    )

    vi.resetModules()
    const fresh = await import('../../stores/settingsStore')
    const state = fresh.useSettingsStore.getState()

    // v1 fields preserved untouched.
    expect(state.apiKey).toBe('sk-existing')
    expect(state.provider).toBe('local')
    expect(state.localBaseUrl).toBe('http://localhost:11434/v1')
    expect(state.localModel).toBe('gemma')
    // v2 fields filled in with safe defaults.
    expect(state.openaiApiKey).toBe('')
    expect(state.openaiModel).toBe('')
    // v3 lightweight slots seeded.
    expect(state.anthropicLightweightModel).toBe('claude-haiku-4-5-20251001')
    expect(state.localLightweightModel).toBe('')
    expect(state.openaiLightweightModel).toBe('')
  })

  it('migrates a v2 persisted blob (no lightweight fields) to v3 defaults', async () => {
    /**
     * Users on the most recent shipped version have a v2 blob that includes
     * every existing field including OpenAI. The v2→v3 step adds the three
     * lightweight slots without touching anything else. This is the
     * migration path most users will actually traverse.
     */
    localStorage.setItem(
      'nopy-settings',
      JSON.stringify({
        state: {
          apiKey: 'sk-existing',
          preferredModel: 'claude-sonnet-4-5',
          maxOutputTokens: 4096,
          contextBudget: 500000,
          onboardingComplete: true,
          sidebarCollapsed: false,
          sessionPanelCollapsed: false,
          journalPath: '/tmp/journal',
          theme: 'dark',
          therapyType: DEFAULTS.therapyType,
          provider: 'anthropic',
          localBaseUrl: 'http://localhost:1234/v1',
          localModel: '',
          openaiApiKey: 'sk-openai',
          openaiModel: 'gpt-4o',
        },
        version: 2,
      }),
    )

    vi.resetModules()
    const fresh = await import('../../stores/settingsStore')
    const state = fresh.useSettingsStore.getState()

    expect(state.preferredModel).toBe('claude-sonnet-4-5')
    expect(state.openaiApiKey).toBe('sk-openai')
    expect(state.openaiModel).toBe('gpt-4o')
    expect(state.anthropicLightweightModel).toBe('claude-haiku-4-5-20251001')
    expect(state.localLightweightModel).toBe('')
    expect(state.openaiLightweightModel).toBe('')
  })

  it('migrates a v3 persisted blob (no modelContextWindowOverride) to v4 default of null', async () => {
    /**
     * The Context Workspace added `modelContextWindowOverride` (the manual
     * context-window value for the budget bar). Users on the previous release
     * have a v3 blob without it; the v3→v4 step must fill it with `null`
     * (auto-detect) and leave every other field untouched. A wrong default
     * here would make the budget bar show the wrong window on first launch.
     */
    // Omit modelContextWindowOverride so we exercise the genuine "absent" case.
    const { modelContextWindowOverride: _omit, ...v3Defaults } = DEFAULTS
    void _omit
    localStorage.setItem(
      'nopy-settings',
      JSON.stringify({
        state: {
          ...v3Defaults,
          apiKey: 'sk-existing',
          contextBudget: 200000,
        },
        version: 3,
      }),
    )

    vi.resetModules()
    const fresh = await import('../../stores/settingsStore')
    const state = fresh.useSettingsStore.getState()

    // New v4 field seeded to null (auto-detect).
    expect(state.modelContextWindowOverride).toBeNull()
    // Pre-existing fields preserved.
    expect(state.apiKey).toBe('sk-existing')
    expect(state.contextBudget).toBe(200000)
  })

  it('selectLlmConfig returns only the LLM-routing fields with the symmetric anthropicMainModel name', () => {
    /**
     * The dispatcher in services/llm.ts needs provider + all six per-provider
     * model slots + the two API keys + the local baseUrl. The persisted key
     * `preferredModel` is renamed to `anthropicMainModel` in the selector so
     * dispatcher code can address every provider's main slot symmetrically.
     */
    useSettingsStore.setState({
      apiKey: 'sk-x',
      preferredModel: 'claude-sonnet',
      anthropicLightweightModel: 'claude-haiku',
      provider: 'openai',
      localBaseUrl: 'http://localhost:11434/v1',
      localModel: 'gemma',
      localLightweightModel: 'gemma-mini',
      openaiApiKey: 'sk-openai-x',
      openaiModel: 'gpt-4o',
      openaiLightweightModel: 'gpt-4o-mini',
      theme: 'dark', // not in the slice
    })

    const config = selectLlmConfig(useSettingsStore.getState())
    expect(config).toEqual({
      provider: 'openai',
      apiKey: 'sk-x',
      anthropicMainModel: 'claude-sonnet',
      anthropicLightweightModel: 'claude-haiku',
      localBaseUrl: 'http://localhost:11434/v1',
      localModel: 'gemma',
      localLightweightModel: 'gemma-mini',
      openaiApiKey: 'sk-openai-x',
      openaiModel: 'gpt-4o',
      openaiLightweightModel: 'gpt-4o-mini',
    })
    expect(Object.keys(config).sort()).toEqual([
      'anthropicLightweightModel', 'anthropicMainModel', 'apiKey',
      'localBaseUrl', 'localLightweightModel', 'localModel',
      'openaiApiKey', 'openaiLightweightModel', 'openaiModel', 'provider',
    ])
  })
})

describe('recent journals', () => {
  it('recording journals builds a most-recent-first list with no duplicates', () => {
    /**
     * The journal launcher offers previously-used journals as quick-pick
     * suggestions. `recordJournal` is called every time a journal is opened or
     * created, so it must (a) put the just-used journal at the front, (b) keep
     * the folder's display name, and (c) never list the same path twice when a
     * journal is re-opened — otherwise the launcher would accumulate duplicate
     * rows for the user's daily journal.
     */
    const { recordJournal } = useSettingsStore.getState()
    recordJournal('/home/me/work-journal')
    recordJournal('/home/me/travel-log')
    recordJournal('/home/me/work-journal') // re-open the first one

    const list = useSettingsStore.getState().recentJournals
    expect(list.map((j) => j.path)).toEqual(['/home/me/work-journal', '/home/me/travel-log'])
    expect(list[0].name).toBe('work-journal')
    expect(typeof list[0].lastOpenedAt).toBe('string')
  })

  it('removing a journal drops it from recents and leaves the rest intact', () => {
    /**
     * A journal folder can be moved or deleted on disk; the launcher lets the
     * user clear such an entry. `removeRecentJournal` must remove only the
     * targeted path and preserve the others' order.
     */
    const { recordJournal, removeRecentJournal } = useSettingsStore.getState()
    recordJournal('/a/one')
    recordJournal('/a/two')

    removeRecentJournal('/a/one')

    expect(useSettingsStore.getState().recentJournals.map((j) => j.path)).toEqual(['/a/two'])
  })

  it('upgrading an existing install seeds the current journal as a recent', async () => {
    /**
     * Existing users have a `journalPath` but no recents list (the field didn't
     * exist before v6). The v5→v6 migration seeds the list from their current
     * journal so it shows up as a suggestion in the new launcher on first
     * launch — they aren't dumped into an empty "no journals" screen.
     */
    localStorage.setItem(
      'nopy-settings',
      JSON.stringify({ state: { journalPath: '/tmp/journal', theme: 'dark' }, version: 5 }),
    )

    vi.resetModules()
    const fresh = await import('../../stores/settingsStore')
    const list = fresh.useSettingsStore.getState().recentJournals

    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ path: '/tmp/journal', name: 'journal' })
  })

  it('a fresh-ish upgrade with no journal seeds an empty recents list', async () => {
    /**
     * A user who never set a journal folder (e.g. browser-only usage) has a
     * blank `journalPath`. The migration must leave recents empty rather than
     * seed a bogus entry, so the launcher shows its welcome/create state.
     */
    localStorage.setItem(
      'nopy-settings',
      JSON.stringify({ state: { journalPath: '', theme: 'system' }, version: 5 }),
    )

    vi.resetModules()
    const fresh = await import('../../stores/settingsStore')
    expect(fresh.useSettingsStore.getState().recentJournals).toEqual([])
  })
})

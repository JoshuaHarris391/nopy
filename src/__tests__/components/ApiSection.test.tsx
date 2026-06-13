import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup, within, waitFor } from '@testing-library/react'

/**
 * Mock the Anthropic model-fetching hook so each test can drive the four UI
 * states — loading, error, empty, populated — without touching the SDK or
 * the network. The default mock returns the empty state.
 *
 * Mock the local probe so LocalBlock's useLocalModels can hit a controlled
 * surface — by default returns a "ready" state with no models.
 *
 * vi.hoisted is required because vi.mock factories run before regular
 * top-level consts are initialized.
 */
const { useAnthropicModelsMock, useOpenaiModelsMock, probeMock, openUrlMock } = vi.hoisted(() => ({
  useAnthropicModelsMock: vi.fn(),
  useOpenaiModelsMock: vi.fn(),
  probeMock: vi.fn(),
  openUrlMock: vi.fn(async () => {}),
}))
vi.mock('../../hooks/useProviderModels', () => ({
  useAnthropicModels: useAnthropicModelsMock,
  useOpenaiModels: useOpenaiModelsMock,
}))
vi.mock('../../services/localServer', async () => {
  const actual = await vi.importActual<typeof import('../../services/localServer')>('../../services/localServer')
  return { ...actual, probe: probeMock }
})
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: openUrlMock,
}))

import { ApiSection } from '../../components/settings/sections/ApiSection'
import { useSettingsStore } from '../../stores/settingsStore'

const DEFAULT_SETTINGS = {
  apiKey: '',
  preferredModel: 'claude-sonnet-4-5-20250514',
  anthropicLightweightModel: 'claude-haiku-4-5-20251001',
  maxOutputTokens: 4096,
  contextBudget: 500000,
  provider: 'anthropic' as const,
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: '',
  localLightweightModel: '',
  openaiApiKey: '',
  openaiModel: '',
  openaiLightweightModel: '',
}

beforeEach(() => {
  useSettingsStore.setState(DEFAULT_SETTINGS)
  useAnthropicModelsMock.mockReturnValue({ models: [], loading: false, error: null })
  useOpenaiModelsMock.mockReturnValue({ models: [], loading: false, error: null })
  probeMock.mockResolvedValue({ ok: false, reason: 'connection-refused' })
  openUrlMock.mockClear()
  // Pretend we're in the Tauri webview so LocalOnboardingCard takes the
  // openUrl path rather than the window.open fallback.
  ;(globalThis as unknown as { window: { __TAURI_INTERNALS__?: object } }).window.__TAURI_INTERNALS__ = {}
})

afterEach(() => {
  cleanup()
  delete (globalThis as unknown as { window: { __TAURI_INTERNALS__?: object } }).window.__TAURI_INTERNALS__
})

/**
 * Order of <select>s in the DOM depends on which provider block is mounted:
 *   Anthropic mode: [0] Main model, [1] Lightweight model, [-2] Max Tokens, [-1] Context Budget
 *   OpenAI mode:    [0] Main model, [1] Lightweight model, [-2] Max Tokens, [-1] Context Budget
 *   Local mode (models loaded): [0] Main model, [1] Lightweight model, [-2] Max Tokens, [-1] Context Budget
 *   Local mode (empty list):    [-2] Max Tokens, [-1] Context Budget
 *     (Local mode uses <input>s for base URL + model when /v1/models is empty.)
 *
 * The two shared rows are always the LAST two selects in DOM order, so we
 * index from the tail to stay stable across provider-block changes.
 */
function getSelects() {
  const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]
  return {
    all: selects,
    model: selects[0],
    lightweightModel: selects[1],
    maxTokens: selects[selects.length - 2],
    contextBudget: selects[selects.length - 1],
  }
}

// ---------------------------------------------------------------------------
// Anthropic mode (default)
// ---------------------------------------------------------------------------

describe('ApiSection — Anthropic mode', () => {
  it('renders the API key input masked by default, toggles to text on the eye button, and writes trimmed value on blur', () => {
    /**
     * The API key is sensitive — it must default to a password input so
     * over-the-shoulder readers can't see it. The eye button is the only
     * way users can verify what they pasted. The trim-on-blur exists
     * because users routinely paste keys with trailing whitespace from
     * Anthropic's dashboard, which silently breaks every API call.
     */
    render(<ApiSection />)

    const input = screen.getByPlaceholderText('sk-ant-...') as HTMLInputElement
    expect(input.type).toBe('password')

    // Eye button has no accessible label — find by being adjacent to the input.
    // The input lives in a div.relative; the visibility toggle is the only
    // <button> inside that container.
    const toggleButton = input.parentElement!.querySelector('button')!
    fireEvent.click(toggleButton)
    expect(input.type).toBe('text')
    fireEvent.click(toggleButton)
    expect(input.type).toBe('password')

    fireEvent.change(input, { target: { value: '  sk-ant-trimmed  ' } })
    fireEvent.blur(input)
    expect(useSettingsStore.getState().apiKey).toBe('sk-ant-trimmed')
  })

  it('model dropdown reflects the four hook states (disabled-empty, loading, error, populated)', () => {
    /**
     * The four states the hook can return must each render a coherent UI:
     *   - no apiKey → disabled, prompts the user to enter a key
     *   - loading  → disabled, shows "Loading models…"
     *   - error    → renders the error string
     *   - populated → renders one option per model with displayName
     * "No models found" (apiKey set, models empty, no error) is asserted
     * in the populated case to keep this single test cohesive.
     */
    const { rerender } = render(<ApiSection />)
    expect(getSelects().model).toBeDisabled()
    expect(within(getSelects().model).getByText('Enter API key to load models')).toBeInTheDocument()

    useSettingsStore.setState({ apiKey: 'sk-x' })
    useAnthropicModelsMock.mockReturnValue({ models: [], loading: true, error: null })
    rerender(<ApiSection />)
    expect(getSelects().model).toBeDisabled()
    expect(within(getSelects().model).getByText('Loading models…')).toBeInTheDocument()

    useAnthropicModelsMock.mockReturnValue({ models: [], loading: false, error: 'Failed to load models' })
    rerender(<ApiSection />)
    expect(within(getSelects().model).getByText('Failed to load models')).toBeInTheDocument()

    useSettingsStore.setState({ apiKey: 'sk-x', preferredModel: 'claude-haiku-4-5' })
    useAnthropicModelsMock.mockReturnValue({
      models: [
        { id: 'claude-haiku-4-5', displayName: 'Haiku 4.5' },
        { id: 'claude-sonnet-4-5', displayName: 'Sonnet 4.5' },
      ],
      loading: false,
      error: null,
    })
    rerender(<ApiSection />)
    const model = getSelects().model
    expect(model).not.toBeDisabled()
    expect(within(model).getByText('Haiku 4.5')).toBeInTheDocument()
    expect(within(model).getByText('Sonnet 4.5')).toBeInTheDocument()

    useAnthropicModelsMock.mockReturnValue({ models: [], loading: false, error: null })
    rerender(<ApiSection />)
    expect(within(getSelects().model).getByText('No models found')).toBeInTheDocument()
  })

  it('selecting a model writes through to setPreferredModel', () => {
    /**
     * The model select is a controlled component — `value` reads the store,
     * `onChange` writes back. A refactor that drops the `onChange` handler
     * would render correctly but silently fail to persist the user's
     * choice, which is the kind of bug only an integration test catches.
     */
    useSettingsStore.setState({ apiKey: 'sk-x', preferredModel: 'claude-haiku-4-5' })
    useAnthropicModelsMock.mockReturnValue({
      models: [
        { id: 'claude-haiku-4-5', displayName: 'Haiku 4.5' },
        { id: 'claude-sonnet-4-5', displayName: 'Sonnet 4.5' },
      ],
      loading: false,
      error: null,
    })
    render(<ApiSection />)

    fireEvent.change(getSelects().model, { target: { value: 'claude-sonnet-4-5' } })
    expect(useSettingsStore.getState().preferredModel).toBe('claude-sonnet-4-5')
  })

  it('Max Output Tokens select renders the documented range and writes through as a number', () => {
    /**
     * Anthropic's API requires `max_tokens` as a number, not a string. The
     * select's onChange uses `Number(e.target.value)`. Same applies to the
     * local OpenAI-compat endpoint, so this test pins the number coercion
     * for both providers.
     */
    render(<ApiSection />)
    const select = getSelects().maxTokens
    for (const value of ['1024', '2048', '4096', '8192', '16384', '32768']) {
      expect(within(select).getByRole('option', { name: Number(value).toLocaleString() })).toBeInTheDocument()
    }

    fireEvent.change(select, { target: { value: '8192' } })
    expect(useSettingsStore.getState().maxOutputTokens).toBe(8192)
    expect(typeof useSettingsStore.getState().maxOutputTokens).toBe('number')
  })

  it('renders a separate Lightweight model dropdown that writes to setAnthropicLightweightModel', () => {
    /**
     * Each provider has TWO model slots after the per-provider-roles refactor:
     * a main model (chat replies, full profile) and a lightweight model
     * (entry indexing, summary profile, chat title). Both dropdowns share
     * the same provider's model list — the only thing distinguishing them
     * is which store setter is wired up. This test pins that wiring so a
     * refactor can't accidentally have the lightweight dropdown write to
     * setPreferredModel (which would silently overwrite the main slot
     * every time the user picked a lightweight model).
     *
     * Setup uses distinct main and lightweight values, then writes to the
     * lightweight dropdown; the main slot must remain untouched.
     */
    useSettingsStore.setState({ apiKey: 'sk-x', preferredModel: 'claude-sonnet-4-5', anthropicLightweightModel: 'claude-haiku-4-5' })
    useAnthropicModelsMock.mockReturnValue({
      models: [
        { id: 'claude-haiku-4-5', displayName: 'Haiku 4.5' },
        { id: 'claude-opus-4-6', displayName: 'Opus 4.6' },
        { id: 'claude-sonnet-4-5', displayName: 'Sonnet 4.5' },
      ],
      loading: false,
      error: null,
    })
    render(<ApiSection />)

    const lightweight = getSelects().lightweightModel
    expect(lightweight.value).toBe('claude-haiku-4-5')
    fireEvent.change(lightweight, { target: { value: 'claude-opus-4-6' } })
    expect(useSettingsStore.getState().anthropicLightweightModel).toBe('claude-opus-4-6')
    // Main slot untouched — proves the two dropdowns write to independent setters.
    expect(useSettingsStore.getState().preferredModel).toBe('claude-sonnet-4-5')
  })

  it('Context Budget select renders the documented range and writes through as a number', () => {
    /**
     * Same number-coercion concern as Max Output Tokens. Context budget
     * stays a shared row across providers (it's a chat-context concept,
     * not a provider concept), so it lives in ApiSection itself.
     */
    render(<ApiSection />)
    const select = getSelects().contextBudget
    for (const value of ['8000', '30000', '60000', '100000', '200000', '500000', '1000000']) {
      expect(within(select).getByRole('option', { name: Number(value).toLocaleString() })).toBeInTheDocument()
    }

    fireEvent.change(select, { target: { value: '200000' } })
    expect(useSettingsStore.getState().contextBudget).toBe(200000)
  })
})

// ---------------------------------------------------------------------------
// Provider toggle + Local mode
// ---------------------------------------------------------------------------

describe('ApiSection — Provider toggle and Local mode', () => {
  it('renders a Provider toggle bound to settings.provider; switching mounts LocalBlock', async () => {
    /**
     * The toggle is the entry point for the entire local-LLM feature. It
     * must update settings.provider AND swap the rendered block (Anthropic
     * → Local) without losing the API key or other Anthropic-side state.
     */
    render(<ApiSection />)
    expect(useSettingsStore.getState().provider).toBe('anthropic')
    // Anthropic block is mounted: API key input is present.
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument()

    const localToggle = screen.getByRole('radio', { name: /local/i })
    fireEvent.click(localToggle)

    expect(useSettingsStore.getState().provider).toBe('local')
    // Anthropic API key input gone; local model input present.
    expect(screen.queryByPlaceholderText('sk-ant-...')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('google/gemma-4-e4b')).toBeInTheDocument()
    })
  })

  it('shows the "not running" status indicator and onboarding card when probe fails', async () => {
    /**
     * Most users land in this state on first toggle: server isn't started.
     * The status indicator must say so AND the onboarding card must appear
     * with the "Download LM Studio" CTA. These together are the entire
     * non-technical-user pathway from "I clicked Local" to "I see what to
     * do next."
     */
    useSettingsStore.setState({ provider: 'local' })
    render(<ApiSection />)
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/isn't running/i)
    })
    expect(screen.getByText(/Local AI isn't running/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download lm studio/i })).toBeInTheDocument()
  })

  it('shows the "no model loaded" status when probe is ok but models[] is empty', async () => {
    /**
     * Server is running, the user clicked Start Server but hasn't loaded
     * a model. Different copy from "not running" — the user's next action
     * is "Load a model in LM Studio", not "Start the server".
     */
    probeMock.mockResolvedValue({ ok: true, models: [] })
    useSettingsStore.setState({ provider: 'local' })
    render(<ApiSection />)
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/no model loaded/i)
    })
    expect(screen.getByText(/no model is loaded/i)).toBeInTheDocument()
  })

  it('shows "Ready" status and hides the onboarding card when probe returns a model that matches localModel', async () => {
    /**
     * The happy path. Status indicator goes green, onboarding card
     * disappears so the settings page no longer shouts at the user.
     * The base URL and model fields remain visible (they're not part of
     * the conditional onboarding card).
     */
    probeMock.mockResolvedValue({ ok: true, models: [{ id: 'gemma', displayName: 'gemma' }] })
    useSettingsStore.setState({ provider: 'local', localModel: 'gemma' })
    render(<ApiSection />)
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/ready/i)
    })
    // Onboarding cards have a left-border bar with status-coloured accent;
    // the most reliable signal for "no card" is the absence of the
    // download CTA and the various failure-state titles.
    expect(screen.queryByRole('button', { name: /download lm studio/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/isn't running/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no model is loaded/i)).not.toBeInTheDocument()
  })

  it('shows the model-name-mismatch state and lists the loaded models when localModel does not match', async () => {
    /**
     * The user typed a model name that doesn't correspond to anything
     * loaded — usually a copy-paste typo or stale state from a previous
     * model. The card surfaces the actual loaded ids so the user can
     * fix the typo without leaving Settings.
     */
    probeMock.mockResolvedValue({ ok: true, models: [{ id: 'gemma-2-2b', displayName: 'gemma-2-2b' }] })
    useSettingsStore.setState({ provider: 'local', localModel: 'totally-wrong-name' })
    render(<ApiSection />)
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/doesn't match/i)
    })
    expect(screen.getByText(/isn't loaded in LM Studio/i)).toBeInTheDocument()
    expect(screen.getByText(/Loaded:/)).toHaveTextContent('gemma-2-2b')
  })

  it('typing into the Model text input (no models loaded) then blurring writes setLocalModel', async () => {
    /**
     * When LM Studio reports zero models, we fall back to a free-text
     * input so the user can set a model id BEFORE loading it in LM
     * Studio. Same blur-to-commit pattern as the Anthropic API key
     * field — no re-render per keystroke.
     */
    probeMock.mockResolvedValue({ ok: true, models: [] })
    useSettingsStore.setState({ provider: 'local' })
    render(<ApiSection />)
    const input = await screen.findByPlaceholderText('google/gemma-4-e4b')
    fireEvent.change(input, { target: { value: 'google/gemma-4-e4b' } })
    fireEvent.blur(input)
    expect(useSettingsStore.getState().localModel).toBe('google/gemma-4-e4b')
  })

  it('renders a dropdown of /v1/models results when LM Studio reports loaded models, and selecting one writes setLocalModel', async () => {
    /**
     * When the probe returns >= 1 loaded model, the Model field becomes a
     * `<select>` populated from the same `/v1/models` payload that drives
     * the status indicator. This is the headline UX for "Local mode is
     * Ready" — the user sees their loaded models, picks one, and the
     * dispatcher uses it. The text input still appears for the empty-list
     * case (covered above) and via the "Custom…" option for power users.
     */
    probeMock.mockResolvedValue({
      ok: true,
      models: [
        { id: 'google/gemma-4-e4b', displayName: 'google/gemma-4-e4b' },
        { id: 'lmstudio-community/Gemma-2-2B-it-GGUF', displayName: 'lmstudio-community/Gemma-2-2B-it-GGUF' },
      ],
    })
    useSettingsStore.setState({ provider: 'local', localModel: '' })
    render(<ApiSection />)

    // Text input gone; select present.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('google/gemma-4-e4b')).not.toBeInTheDocument()
    })
    const allSelects = document.querySelectorAll('select')
    // [0] Model dropdown, [1] Max Tokens, [2] Context Budget — model is the
    // first because it lives inside LocalBlock, before the shared rows.
    const modelSelect = allSelects[0] as HTMLSelectElement
    expect(within(modelSelect).getByText('google/gemma-4-e4b')).toBeInTheDocument()
    expect(within(modelSelect).getByText('lmstudio-community/Gemma-2-2B-it-GGUF')).toBeInTheDocument()
    expect(within(modelSelect).getByText('Custom…')).toBeInTheDocument()
    expect(screen.getByText(/2 models loaded in LM Studio/i)).toBeInTheDocument()

    fireEvent.change(modelSelect, { target: { value: 'lmstudio-community/Gemma-2-2B-it-GGUF' } })
    expect(useSettingsStore.getState().localModel).toBe('lmstudio-community/Gemma-2-2B-it-GGUF')
  })

  it('auto-selects the only loaded model when LM Studio has exactly one and nothing is set', async () => {
    /**
     * The most common case: user installed LM Studio, loaded one model,
     * toggled nopy to Local. Forcing them to also pick that one model
     * from a one-item dropdown is friction. The hook auto-fills it
     * instead, so the status indicator goes straight to "Ready".
     */
    probeMock.mockResolvedValue({
      ok: true,
      models: [{ id: 'google/gemma-4-e4b', displayName: 'google/gemma-4-e4b' }],
    })
    useSettingsStore.setState({ provider: 'local', localModel: '' })
    render(<ApiSection />)

    await waitFor(() => {
      expect(useSettingsStore.getState().localModel).toBe('google/gemma-4-e4b')
    })
  })

  it('clicking Download LM Studio invokes openUrl with the LM Studio site', async () => {
    /**
     * The opener plugin must be wired through correctly — Tauri webview
     * blocks plain `target="_blank"` anchors, so the download path goes
     * through `@tauri-apps/plugin-opener`. Test pins the URL so a
     * future refactor can't quietly swap to a different domain.
     */
    useSettingsStore.setState({ provider: 'local' })
    render(<ApiSection />)
    const downloadBtn = await screen.findByRole('button', { name: /download lm studio/i })
    fireEvent.click(downloadBtn)
    await waitFor(() => expect(openUrlMock).toHaveBeenCalledWith('https://lmstudio.ai/'))
  })
})

// ---------------------------------------------------------------------------
// OpenAI mode
// ---------------------------------------------------------------------------

describe('ApiSection — OpenAI mode', () => {
  it('toggling to OpenAI mounts OpenaiBlock and unmounts the Anthropic input without losing the Anthropic key', () => {
    /**
     * Toggling providers must swap the rendered block but never clobber the
     * other provider's saved state — a user mid-experiment with both keys
     * should be able to flip back and forth freely. This test pins both
     * properties: OpenaiBlock's `sk-...` placeholder appears, the
     * Anthropic-specific `sk-ant-...` placeholder disappears, and the
     * Anthropic apiKey in the store is untouched.
     */
    useSettingsStore.setState({ apiKey: 'sk-ant-saved' })
    render(<ApiSection />)
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument()

    const openaiToggle = screen.getByRole('radio', { name: /openai/i })
    fireEvent.click(openaiToggle)

    expect(useSettingsStore.getState().provider).toBe('openai')
    expect(useSettingsStore.getState().apiKey).toBe('sk-ant-saved')
    expect(screen.queryByPlaceholderText('sk-ant-...')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument()
  })

  it('OpenAI API key input is masked, toggles to text on the eye button, and writes trimmed value on blur', () => {
    /**
     * Same security and ergonomic guarantees as the Anthropic key: password
     * input by default, eye button reveals it, blur trims whitespace from
     * paste. The trim matters because OpenAI's dashboard frequently leaves
     * a trailing newline when copying via "Copy key" on certain browsers.
     */
    useSettingsStore.setState({ provider: 'openai' })
    render(<ApiSection />)

    const input = screen.getByPlaceholderText('sk-...') as HTMLInputElement
    expect(input.type).toBe('password')

    const toggleButton = input.parentElement!.querySelector('button')!
    fireEvent.click(toggleButton)
    expect(input.type).toBe('text')

    fireEvent.change(input, { target: { value: '  sk-openai-trimmed  ' } })
    fireEvent.blur(input)
    expect(useSettingsStore.getState().openaiApiKey).toBe('sk-openai-trimmed')
  })

  it('model dropdown reflects the four hook states (disabled-empty, loading, error, populated) and writes selection through to setOpenaiModel', () => {
    /**
     * Mirror of the Anthropic dropdown contract: each hook state renders
     * coherent UI, and choosing a model persists via the controlled
     * onChange. Bundled into one test because each state is one assertion
     * — splitting would just duplicate setup.
     */
    useSettingsStore.setState({ provider: 'openai' })
    const { rerender } = render(<ApiSection />)
    // No key yet: dropdown disabled, prompts for key.
    let modelSelect = document.querySelectorAll('select')[0] as HTMLSelectElement
    expect(modelSelect).toBeDisabled()
    expect(within(modelSelect).getByText('Enter API key to load models')).toBeInTheDocument()

    // Loading state.
    useSettingsStore.setState({ provider: 'openai', openaiApiKey: 'sk-x' })
    useOpenaiModelsMock.mockReturnValue({ models: [], loading: true, error: null })
    rerender(<ApiSection />)
    modelSelect = document.querySelectorAll('select')[0] as HTMLSelectElement
    expect(modelSelect).toBeDisabled()
    expect(within(modelSelect).getByText('Loading models…')).toBeInTheDocument()

    // Error state.
    useOpenaiModelsMock.mockReturnValue({ models: [], loading: false, error: 'Failed to load models' })
    rerender(<ApiSection />)
    modelSelect = document.querySelectorAll('select')[0] as HTMLSelectElement
    expect(within(modelSelect).getByText('Failed to load models')).toBeInTheDocument()

    // Populated state — selecting a model writes through.
    useSettingsStore.setState({ provider: 'openai', openaiApiKey: 'sk-x', openaiModel: 'gpt-4o-mini' })
    useOpenaiModelsMock.mockReturnValue({
      models: [
        { id: 'gpt-4o', displayName: 'gpt-4o' },
        { id: 'gpt-4o-mini', displayName: 'gpt-4o-mini' },
      ],
      loading: false,
      error: null,
    })
    rerender(<ApiSection />)
    modelSelect = document.querySelectorAll('select')[0] as HTMLSelectElement
    expect(modelSelect).not.toBeDisabled()
    expect(within(modelSelect).getByText('gpt-4o')).toBeInTheDocument()

    fireEvent.change(modelSelect, { target: { value: 'gpt-4o' } })
    expect(useSettingsStore.getState().openaiModel).toBe('gpt-4o')
  })
})

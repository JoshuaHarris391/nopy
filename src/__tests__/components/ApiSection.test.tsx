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
const { useAnthropicModelsMock, probeMock, openUrlMock } = vi.hoisted(() => ({
  useAnthropicModelsMock: vi.fn(),
  probeMock: vi.fn(),
  openUrlMock: vi.fn(async () => {}),
}))
vi.mock('../../hooks/useAnthropicModels', () => ({
  useAnthropicModels: useAnthropicModelsMock,
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
  maxOutputTokens: 4096,
  contextBudget: 500000,
  provider: 'anthropic' as const,
  localBaseUrl: 'http://localhost:1234/v1',
  localModel: '',
}

beforeEach(() => {
  useSettingsStore.setState(DEFAULT_SETTINGS)
  useAnthropicModelsMock.mockReturnValue({ models: [], loading: false, error: null })
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
 *   Anthropic mode: [0] Model, [1] Max Tokens, [2] Context Budget
 *   Local mode:     [0] Max Tokens, [1] Context Budget
 *     (Local mode uses <input>s for base URL + model, not selects.)
 */
function getSelects() {
  const selects = document.querySelectorAll('select')
  return {
    all: Array.from(selects) as HTMLSelectElement[],
    model: selects[0] as HTMLSelectElement,
    maxTokens: selects[1] as HTMLSelectElement,
    contextBudget: selects[2] as HTMLSelectElement,
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

  it('typing into the Model input then blurring writes setLocalModel', async () => {
    /**
     * Free-text model entry is the v1 design (no auto-pick from the
     * dropdown). Same blur-to-commit pattern as the Anthropic API key
     * field so users can paste long ids without firing a re-render per
     * keystroke.
     */
    probeMock.mockResolvedValue({ ok: true, models: [] })
    useSettingsStore.setState({ provider: 'local' })
    render(<ApiSection />)
    const input = await screen.findByPlaceholderText('google/gemma-4-e4b')
    fireEvent.change(input, { target: { value: 'google/gemma-4-e4b' } })
    fireEvent.blur(input)
    expect(useSettingsStore.getState().localModel).toBe('google/gemma-4-e4b')
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

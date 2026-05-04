import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup, within } from '@testing-library/react'

/**
 * Mock the model-fetching hook so each test can drive the four UI states
 * — loading, error, empty, populated — without touching the SDK or the
 * network. The default mock returns the empty state; tests override per
 * case via `vi.mocked(useAnthropicModels).mockReturnValue(...)`.
 *
 * vi.hoisted is required because vi.mock factories run before regular
 * top-level consts are initialized.
 */
const { useAnthropicModelsMock } = vi.hoisted(() => ({
  useAnthropicModelsMock: vi.fn(),
}))
vi.mock('../../hooks/useAnthropicModels', () => ({
  useAnthropicModels: useAnthropicModelsMock,
}))

import { ApiSection } from '../../components/settings/sections/ApiSection'
import { useSettingsStore } from '../../stores/settingsStore'

beforeEach(() => {
  // Reset the settings store to a known shape (apiKey empty so the
  // disabled-by-default cases work).
  useSettingsStore.setState({
    apiKey: '',
    preferredModel: 'claude-sonnet-4-5-20250514',
    maxOutputTokens: 4096,
    contextBudget: 500000,
  })
  useAnthropicModelsMock.mockReturnValue({ models: [], loading: false, error: null })
})

afterEach(() => {
  cleanup()
})

/**
 * The component renders three `<select>` elements without distinguishing
 * accessible labels, so test-id-by-position is the most stable selector.
 * Order in the DOM:
 *   [0] Model
 *   [1] Max Output Tokens
 *   [2] Context Budget
 */
function getSelects() {
  const selects = document.querySelectorAll('select')
  return {
    model: selects[0] as HTMLSelectElement,
    maxTokens: selects[1] as HTMLSelectElement,
    contextBudget: selects[2] as HTMLSelectElement,
  }
}

describe('ApiSection', () => {
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

    // Toggle visibility — the eye/eye-off button is the only <button> in the section above the selects.
    const toggleButton = document.querySelector('button')!
    fireEvent.click(toggleButton)
    expect(input.type).toBe('text')
    fireEvent.click(toggleButton)
    expect(input.type).toBe('password')

    // Type with whitespace, blur, expect trimmed write-through.
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
    // (a) No API key — disabled with the "Enter API key" prompt.
    const { rerender } = render(<ApiSection />)
    expect(getSelects().model).toBeDisabled()
    expect(within(getSelects().model).getByText('Enter API key to load models')).toBeInTheDocument()

    // (b) Loading — disabled with the loading message.
    useSettingsStore.setState({ apiKey: 'sk-x' })
    useAnthropicModelsMock.mockReturnValue({ models: [], loading: true, error: null })
    rerender(<ApiSection />)
    expect(getSelects().model).toBeDisabled()
    expect(within(getSelects().model).getByText('Loading models…')).toBeInTheDocument()

    // (c) Error — error string surfaced as an option.
    useAnthropicModelsMock.mockReturnValue({ models: [], loading: false, error: 'Failed to load models' })
    rerender(<ApiSection />)
    expect(within(getSelects().model).getByText('Failed to load models')).toBeInTheDocument()

    // (d) Populated — model displayNames render as options. Pre-set the store
    // value to match an option so React doesn't warn about an out-of-range select value.
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

    // (e) Empty list with a key — "No models found" placeholder.
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
     * Anthropic's API requires `max_tokens` as a number, not a string.
     * The select's onChange uses `Number(e.target.value)` — if a refactor
     * removes that coercion, the API rejects the request with a 400.
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
     * Same number-coercion concern as Max Output Tokens. The context-budget
     * options span 8k → 1M to cover both small models (8k window) and
     * Sonnet/Opus (200k+) without forcing the user to type a number.
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

describe('forward-looking provider toggle (todo)', () => {
  // Pinned for the multi-provider refactor in docs/tasks/10-gemma4-local-integration.md.
  // ApiSection will gain a Provider toggle (Anthropic / Local) bound to
  // `settings.provider`. When Local is selected, the API key field is hidden
  // and a Backend dropdown + connection indicator take its place.
  it.todo('renders Provider toggle (Anthropic / Local) bound to settings.provider')
})

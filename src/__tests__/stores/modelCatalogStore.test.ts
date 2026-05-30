import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * In-memory mock of idb-keyval — the catalog store persists the resolved
 * id→window map under `nopy-litellm-windows`. A Map is enough to assert the
 * round-trip without jsdom's missing IndexedDB.
 */
const idbStore = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { idbStore.set(key, value) }),
  del: vi.fn(async (key: string) => { idbStore.delete(key) }),
}))

import { useModelCatalogStore, parseLiteLLMWindows } from '../../stores/modelCatalogStore'

const IDB_KEY = 'nopy-litellm-windows'

beforeEach(() => {
  idbStore.clear()
  useModelCatalogStore.setState({ windows: {}, loaded: false, fetching: false })
  vi.restoreAllMocks()
})

describe('parseLiteLLMWindows', () => {
  it('keeps a numeric window, preferring max_input_tokens, and skips junk entries', () => {
    /**
     * The LiteLLM file is a flat id→metadata map. We keep only a numeric context
     * window, preferring `max_input_tokens` (the real input window) over
     * `max_tokens` (the output cap), and skip non-model / non-numeric entries
     * such as `sample_spec`.
     * Input: a mix of well-formed, partial, and junk entries
     * Expected output: only the numeric-window models
     */
    const json = {
      'gpt-4o': { max_input_tokens: 128000, max_tokens: 16384 },
      'claude-x': { max_tokens: 200000 }, // only max_tokens → used as fallback
      'no-window': { mode: 'chat' }, // no numeric window → skipped
      sample_spec: 'not an object', // skipped
      bad: { max_input_tokens: 'lots' }, // non-numeric → skipped
    }
    expect(parseLiteLLMWindows(json)).toEqual({ 'gpt-4o': 128000, 'claude-x': 200000 })
  })

  it('returns an empty map for non-object input', () => {
    expect(parseLiteLLMWindows(null)).toEqual({})
    expect(parseLiteLLMWindows('nope')).toEqual({})
  })
})

describe('useModelCatalogStore', () => {
  it('fetches the dataset, stores windows, and persists to idb', async () => {
    /**
     * The happy path: first run with an empty cache fetches the LiteLLM file,
     * parses it into the windows map, and writes it to idb so later sessions
     * skip the network.
     * Input: empty idb, fetch returns one model
     * Expected output: windows populated, loaded true, idb written
     */
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ 'gpt-4o': { max_input_tokens: 128000 } }),
    } as unknown as Response)

    await useModelCatalogStore.getState().ensure()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(useModelCatalogStore.getState().windows).toEqual({ 'gpt-4o': 128000 })
    expect(useModelCatalogStore.getState().loaded).toBe(true)
    const cached = idbStore.get(IDB_KEY) as { windows: Record<string, number> }
    expect(cached.windows).toEqual({ 'gpt-4o': 128000 })
  })

  it('hydrates from a fresh idb cache without re-fetching', async () => {
    /**
     * Within the TTL, a cached map is authoritative — we must not hit the
     * network on every app start.
     * Input: a fresh idb entry (at = now)
     * Expected output: windows from idb, fetch never called
     */
    idbStore.set(IDB_KEY, { at: Date.now(), windows: { 'gpt-4o': 99999 } })
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await useModelCatalogStore.getState().ensure()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(useModelCatalogStore.getState().windows).toEqual({ 'gpt-4o': 99999 })
  })

  it('does not throw when the fetch fails, leaving the store usable', async () => {
    /**
     * Offline must degrade gracefully: ensure() swallows the error so the bar
     * falls back to the static map/default rather than crashing the view.
     * Input: fetch rejects, empty cache
     * Expected output: ensure resolves, windows stay empty
     */
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(useModelCatalogStore.getState().ensure()).resolves.toBeUndefined()
    expect(useModelCatalogStore.getState().windows).toEqual({})
  })

  it('contextWindowFor matches exactly, then by stripping a date suffix', () => {
    /**
     * The app's model ids are often dated (e.g. claude-sonnet-4-5-20250514)
     * while LiteLLM keys the undated id. An exact match is tried first, then the
     * id with a trailing -YYYYMMDD removed.
     * Input: windows keyed by undated ids
     * Expected output: exact and date-stripped lookups resolve; unknown is undefined
     */
    useModelCatalogStore.setState({ windows: { 'claude-sonnet-4-5': 200000, 'gpt-4o': 128000 }, loaded: true })
    const { contextWindowFor } = useModelCatalogStore.getState()
    expect(contextWindowFor('gpt-4o')).toBe(128000)
    expect(contextWindowFor('claude-sonnet-4-5-20250514')).toBe(200000)
    expect(contextWindowFor('unknown-model')).toBeUndefined()
  })
})

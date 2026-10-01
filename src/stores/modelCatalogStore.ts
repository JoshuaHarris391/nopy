import { create } from 'zustand'
import { get, set } from 'idb-keyval'

/**
 * Source of real context-window sizes for hosted models. Two layers feed it:
 *   1. LiteLLM publishes a maintained id→metadata map (OpenAI, Anthropic, and
 *      many more) as a single JSON file. We fetch it once, keep only
 *      `id → context window`, and cache it in IndexedDB.
 *   2. Providers that report a window in their own `/models` response (Venice
 *      returns `model_spec.availableContextTokens`) are recorded verbatim via
 *      `recordLiveWindows` and take precedence — the provider is authoritative
 *      for its own models, and ids LiteLLM doesn't carry still resolve.
 * Local (LM Studio) uses its own native ping instead.
 */
const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const IDB_KEY = 'nopy-litellm-windows'
const LIVE_IDB_KEY = 'nopy-provider-windows'
const TTL_MS = 1000 * 60 * 60 * 24 * 7 // refresh weekly

interface CachedWindows {
  at: number
  windows: Record<string, number>
}

/** Extract `model id → context window` from the raw LiteLLM JSON. */
export function parseLiteLLMWindows(json: unknown): Record<string, number> {
  const windows: Record<string, number> = {}
  if (!json || typeof json !== 'object') return windows
  for (const [id, info] of Object.entries(json as Record<string, unknown>)) {
    if (!info || typeof info !== 'object') continue
    const rec = info as Record<string, unknown>
    const w = typeof rec.max_input_tokens === 'number'
      ? rec.max_input_tokens
      : typeof rec.max_tokens === 'number'
        ? rec.max_tokens
        : undefined
    if (typeof w === 'number' && w > 0) windows[id] = w
  }
  return windows
}

interface ModelCatalogState {
  windows: Record<string, number>
  /** Windows reported by a provider's own `/models` response (authoritative). */
  liveWindows: Record<string, number>
  loaded: boolean
  fetching: boolean
  /** Hydrate from idb and (if missing/stale) fetch the dataset. Safe to call repeatedly. */
  ensure: () => Promise<void>
  /** Merge provider-reported windows and persist them for later sessions. */
  recordLiveWindows: (windows: Record<string, number>) => void
  /** Context window for a model id — a provider window or catalog match, then a date-suffix-stripped match. */
  contextWindowFor: (modelId: string) => number | undefined
}

export const useModelCatalogStore = create<ModelCatalogState>((setState, getState) => ({
  windows: {},
  liveWindows: {},
  loaded: false,
  fetching: false,

  ensure: async () => {
    if (getState().loaded || getState().fetching) return
    setState({ fetching: true })
    try {
      const cached = await get<CachedWindows>(IDB_KEY)
      if (cached?.windows && Object.keys(cached.windows).length > 0) {
        setState({ windows: cached.windows, loaded: true })
      }
      const cachedLive = await get<Record<string, number>>(LIVE_IDB_KEY)
      if (cachedLive && Object.keys(cachedLive).length > 0) {
        setState({ liveWindows: cachedLive })
      }
      const stale = !cached || Date.now() - cached.at > TTL_MS
      if (stale) {
        const res = await fetch(LITELLM_URL)
        if (res.ok) {
          const windows = parseLiteLLMWindows(await res.json())
          if (Object.keys(windows).length > 0) {
            setState({ windows, loaded: true })
            await set(IDB_KEY, { at: Date.now(), windows })
          }
        }
      }
    } catch (e) {
      // Offline / unreachable — keep whatever we hydrated (or nothing) and let
      // getModelContextWindow fall back to the static map + default.
      console.warn('[modelCatalogStore] context-window fetch failed; using fallback:', e)
    } finally {
      setState({ fetching: false })
    }
  },

  recordLiveWindows: (windows) => {
    const merged = { ...getState().liveWindows, ...windows }
    setState({ liveWindows: merged })
    // Persist best-effort: a failed write must never break the provider fetch.
    set(LIVE_IDB_KEY, merged).catch((e) =>
      console.warn('[modelCatalogStore] failed to persist provider windows:', e),
    )
  },

  contextWindowFor: (modelId) => {
    if (!modelId) return undefined
    const { liveWindows, windows } = getState()
    const stripped = modelId.replace(/-\d{8}$/, '')
    return liveWindows[modelId] ?? liveWindows[stripped] ?? windows[modelId] ?? windows[stripped]
  },
}))

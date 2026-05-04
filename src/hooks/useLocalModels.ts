import { useState, useEffect, useCallback } from 'react'
import { probe, type ProbeResult } from '../services/localServer'

type ProbeError = 'connection-refused' | 'no-model-loaded' | 'timeout' | 'http-error'

export interface UseLocalModelsResult {
  models: { id: string; displayName: string }[]
  loading: boolean
  /**
   * 'connection-refused' — server not running on the configured port.
   * 'no-model-loaded' — server up, but `/v1/models` returned an empty list.
   * 'timeout' — `/v1/models` didn't respond within the probe deadline.
   * null — last probe succeeded with at least one model loaded.
   */
  error: ProbeError | null
  /** Manual re-probe trigger — used by the Refresh button in LocalBlock. */
  refresh: () => void
}

interface ProbeState {
  models: { id: string; displayName: string }[]
  loading: boolean
  error: ProbeError | null
}

const IDLE: ProbeState = { models: [], loading: false, error: null }

/**
 * Mirror of `useAnthropicModels` for the LM Studio side. One probe call per
 * `baseUrl` change (and per manual refresh). No background polling — the
 * settings UI re-mounts on focus, the chat-send error path triggers refresh
 * via Retry, and that's enough liveness for v1 without burning CPU.
 *
 * State is consolidated into a single `ProbeState` object so the lint
 * rule that bans cascading setState-in-effect calls stays happy. Each
 * effect run resets via one `setState` (rather than three).
 */
export function useLocalModels(baseUrl: string): UseLocalModelsResult {
  const [state, setState] = useState<ProbeState>(IDLE)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    // Skip the probe entirely when baseUrl is empty. We don't reset state
    // here — the empty case is derived below, so previous state being
    // "stale" never reaches the UI. This shape keeps the effect body free
    // of synchronous setState (an early-return + setState anti-pattern
    // that the react-hooks/set-state-in-effect rule flags).
    if (!baseUrl) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag must flip true before the async probe; identical pattern to useAnthropicModels.ts
    setState({ models: [], loading: true, error: null })
    probe(baseUrl)
      .then((result: ProbeResult) => {
        if (cancelled) return
        if (!result.ok) {
          setState({ models: [], loading: false, error: result.reason })
          return
        }
        setState({
          models: result.models,
          loading: false,
          error: result.models.length === 0 ? 'no-model-loaded' : null,
        })
      })
    return () => {
      cancelled = true
    }
  }, [baseUrl, refreshKey])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  // Derive the empty-baseUrl case so we don't have to setState(IDLE)
  // inside the effect (see the comment above).
  const effective = baseUrl ? state : IDLE
  return { models: effective.models, loading: effective.loading, error: effective.error, refresh }
}

import { useState, useEffect, useCallback } from 'react'
import { probe, fetchLoadedModelDetails, type ProbeResult, type LoadedModelDetails } from '../services/localServer'

type ProbeError = 'connection-refused' | 'no-model-loaded' | 'timeout' | 'http-error'

export interface LocalModel {
  id: string
  displayName: string
  /**
   * Loaded context length in tokens, when LM Studio's native /api/v1/models
   * endpoint is reachable AND reports it. `null` for non-LM-Studio runtimes
   * (Ollama, llama.cpp server, etc.) and when LM Studio doesn't expose it.
   */
  loadedContextLength: number | null
  maxContextLength: number | null
}

export interface UseLocalModelsResult {
  models: LocalModel[]
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
  models: LocalModel[]
  loading: boolean
  error: ProbeError | null
}

const IDLE: ProbeState = { models: [], loading: false, error: null }

function mergeDetails(
  models: { id: string; displayName: string }[],
  details: LoadedModelDetails[],
): LocalModel[] {
  const detailById = new Map(details.map((d) => [d.id, d]))
  return models.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    loadedContextLength: detailById.get(m.id)?.loadedContextLength ?? null,
    maxContextLength: detailById.get(m.id)?.maxContextLength ?? null,
  }))
}

/**
 * Mirror of `useAnthropicModels` for the LM Studio side. One probe call per
 * `baseUrl` change (and per manual refresh). No background polling — the
 * settings UI re-mounts on focus, the chat-send error path triggers refresh
 * via Retry, and that's enough liveness for v1 without burning CPU.
 *
 * Two parallel probes per refresh:
 *   1. /v1/models (OpenAI-compat) — works for LM Studio, Ollama, anything.
 *      This is the source of truth for "what models are loaded".
 *   2. /api/v1/models (LMS native) — only LM Studio responds. Adds context-
 *      length info so we can warn the user about small contexts before they
 *      hit a CONTEXT_TOO_LARGE error mid-chat.
 *
 * State is consolidated into a single `ProbeState` object so the lint
 * rule that bans cascading setState-in-effect calls stays happy.
 */
export function useLocalModels(baseUrl: string): UseLocalModelsResult {
  const [state, setState] = useState<ProbeState>(IDLE)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!baseUrl) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag must flip true before the async probe; identical pattern to useAnthropicModels.ts
    setState({ models: [], loading: true, error: null })
    Promise.all([probe(baseUrl), fetchLoadedModelDetails(baseUrl)])
      .then(([result, details]: [ProbeResult, LoadedModelDetails[]]) => {
        if (cancelled) return
        if (!result.ok) {
          setState({ models: [], loading: false, error: result.reason })
          return
        }
        setState({
          models: mergeDetails(result.models, details),
          loading: false,
          error: result.models.length === 0 ? 'no-model-loaded' : null,
        })
      })
    return () => {
      cancelled = true
    }
  }, [baseUrl, refreshKey])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  const effective = baseUrl ? state : IDLE
  return { models: effective.models, loading: effective.loading, error: effective.error, refresh }
}

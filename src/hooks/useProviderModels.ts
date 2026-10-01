import { useState, useEffect } from 'react'
import { useModelCatalogStore } from '../stores/modelCatalogStore'
import type { ProviderModel } from '../services/models'

type ProviderModule = Promise<{ fetchModels: (apiKey: string) => Promise<ProviderModel[]> }>

/**
 * Shared model-list loader for hosted providers. The provider module is
 * loaded lazily (dynamic import) so opening Settings doesn't pull in both
 * SDK bundles when only one provider is configured. `useAnthropicModels`
 * and `useOpenaiModels` are thin named wrappers so call sites stay
 * self-documenting.
 */
function useProviderModels(loadProvider: () => ProviderModule, apiKey: string) {
  const [models, setModels] = useState<ProviderModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!apiKey) {
      setModels([])
      return
    }
    setLoading(true)
    setError(null)
    loadProvider().then(({ fetchModels }) =>
      fetchModels(apiKey)
        .then((list) => {
          setModels(list)
          // Providers that report their own usable window (Venice returns
          // `model_spec.availableContextTokens`) feed it to the catalog store, so
          // the Context budget bar and message budgeting use the real number
          // instead of the per-provider fallback. Providers that don't report a
          // window contribute nothing and keep the LiteLLM/static behaviour.
          const windows: Record<string, number> = {}
          for (const m of list) if (m.contextTokens) windows[m.id] = m.contextTokens
          if (Object.keys(windows).length > 0) {
            useModelCatalogStore.getState().recordLiveWindows(windows)
          }
        })
        .catch(() => setError('Failed to load models'))
        .finally(() => setLoading(false))
    )
    // loadProvider is a static module thunk — identity is stable per wrapper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  return { models, loading, error }
}

export function useAnthropicModels(apiKey: string) {
  return useProviderModels(() => import('../services/anthropic'), apiKey)
}

export function useOpenaiModels(apiKey: string) {
  return useProviderModels(() => import('../services/openai'), apiKey)
}

export function useVeniceModels(apiKey: string) {
  return useProviderModels(() => import('../services/venice'), apiKey)
}

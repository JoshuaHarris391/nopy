import { useState, useEffect } from 'react'

type ProviderModule = Promise<{ fetchModels: (apiKey: string) => Promise<{ id: string; displayName: string }[]> }>

/**
 * Shared model-list loader for hosted providers. The provider module is
 * loaded lazily (dynamic import) so opening Settings doesn't pull in both
 * SDK bundles when only one provider is configured. `useAnthropicModels`
 * and `useOpenaiModels` are thin named wrappers so call sites stay
 * self-documenting.
 */
function useProviderModels(loadProvider: () => ProviderModule, apiKey: string) {
  const [models, setModels] = useState<{ id: string; displayName: string }[]>([])
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
        .then(setModels)
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

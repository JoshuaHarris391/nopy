import { useState, useEffect } from 'react'

export function useAnthropicModels(apiKey: string) {
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
    import('../services/anthropic').then(({ fetchModels }) =>
      fetchModels(apiKey)
        .then(setModels)
        .catch(() => setError('Failed to load models'))
        .finally(() => setLoading(false))
    )
  }, [apiKey])

  return { models, loading, error }
}

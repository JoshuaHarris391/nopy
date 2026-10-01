import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

/**
 * The hook dynamically imports the provider module; `vi.mock` intercepts that
 * dynamic import so the test never touches the network. `idb-keyval` is stubbed
 * because `recordLiveWindows` persists through it (jsdom has no IndexedDB).
 */
const { fetchModelsMock } = vi.hoisted(() => ({ fetchModelsMock: vi.fn() }))
vi.mock('../../services/venice', () => ({ fetchModels: fetchModelsMock }))
vi.mock('idb-keyval', () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
}))

import { useVeniceModels } from '../../hooks/useProviderModels'
import { useModelCatalogStore } from '../../stores/modelCatalogStore'

beforeEach(() => {
  fetchModelsMock.mockReset()
  useModelCatalogStore.setState({ windows: {}, liveWindows: {}, loaded: false, fetching: false })
})

describe('useProviderModels', () => {
  it('records provider-reported context windows into the catalog store', async () => {
    /**
     * Venice's `/models` response is the only source of its real windows (1M for
     * Kimi, etc.). The hook must forward every reported window to the catalog
     * store so the Context budget bar and message budgeting resolve the true
     * number instead of the 32k provider fallback.
     * Input: two models with windows, one without
     * Expected output: only the reported windows land in liveWindows
     */
    fetchModelsMock.mockResolvedValue([
      { id: 'kimi-k2-thinking', displayName: 'kimi-k2-thinking', contextTokens: 1_000_000 },
      { id: 'llama-3.2-3b', displayName: 'llama-3.2-3b', contextTokens: 131_072 },
      { id: 'no-window', displayName: 'no-window' },
    ])

    const { result } = renderHook(() => useVeniceModels('vk-x'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(useModelCatalogStore.getState().liveWindows).toEqual({
      'kimi-k2-thinking': 1_000_000,
      'llama-3.2-3b': 131_072,
    })
    expect(useModelCatalogStore.getState().contextWindowFor('kimi-k2-thinking')).toBe(1_000_000)
  })

  it('leaves the store untouched when a provider reports no windows', async () => {
    /**
     * Anthropic/OpenAI list models without a window; recording an empty map
     * would be a pointless idb write, and a stale provider window must never be
     * clobbered by an empty result.
     */
    fetchModelsMock.mockResolvedValue([{ id: 'claude-x', displayName: 'claude-x' }])

    const { result } = renderHook(() => useVeniceModels('vk-x'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(useModelCatalogStore.getState().liveWindows).toEqual({})
  })
})

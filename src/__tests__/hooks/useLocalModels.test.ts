import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

/**
 * Mock the underlying probe so the hook test never touches the network and
 * never depends on localServer's SSE / fetch logic. Each test pushes the
 * desired probe result via `probeMock.mockResolvedValueOnce(...)`.
 *
 * `fetchLoadedModelDetailsMock` is the LMS-native context-length sniff —
 * defaults to an empty array (the Ollama / non-LM-Studio case) so existing
 * tests don't need to think about it. Tests that care about loaded context
 * lengths override per-call.
 */
const { probeMock, fetchLoadedModelDetailsMock } = vi.hoisted(() => ({
  probeMock: vi.fn(),
  fetchLoadedModelDetailsMock: vi.fn(async () => [] as unknown[]),
}))
vi.mock('../../services/localServer', () => ({
  probe: probeMock,
  fetchLoadedModelDetails: fetchLoadedModelDetailsMock,
}))

import { useLocalModels } from '../../hooks/useLocalModels'

beforeEach(() => {
  probeMock.mockReset()
  fetchLoadedModelDetailsMock.mockReset()
  fetchLoadedModelDetailsMock.mockResolvedValue([])
})

describe('useLocalModels', () => {
  it('returns models and clears error when probe reports an ok server with at least one model', async () => {
    /**
     * The "Ready" path: LM Studio is running, server is on, model is
     * loaded. The hook hands the model list to LocalBlock for the
     * autocomplete and clears any prior error so the status indicator
     * goes green.
     */
    probeMock.mockResolvedValueOnce({ ok: true, models: [{ id: 'gemma-2-2b', displayName: 'gemma-2-2b' }] })
    const { result } = renderHook(() => useLocalModels('http://localhost:1234/v1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.models).toEqual([
      { id: 'gemma-2-2b', displayName: 'gemma-2-2b', loadedContextLength: null, maxContextLength: null },
    ])
    expect(result.current.error).toBeNull()
  })

  it('returns "no-model-loaded" error when probe is ok but the model list is empty', async () => {
    /**
     * Server is up, no model has been clicked Load. The status indicator
     * needs this distinct state because the user-facing copy is different
     * from "server isn't running" — they need to load a model, not start
     * the server.
     */
    probeMock.mockResolvedValueOnce({ ok: true, models: [] })
    const { result } = renderHook(() => useLocalModels('http://localhost:1234/v1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.models).toEqual([])
    expect(result.current.error).toBe('no-model-loaded')
  })

  it('returns "connection-refused" when probe reports the server is unreachable', async () => {
    /**
     * The most common failure: user toggled to Local but hasn't started
     * LM Studio's server yet. The error code drives the onboarding card's
     * "Open LM Studio → Start Server" copy.
     */
    probeMock.mockResolvedValueOnce({ ok: false, reason: 'connection-refused' })
    const { result } = renderHook(() => useLocalModels('http://localhost:1234/v1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('connection-refused')
  })

  it('refresh() re-runs probe so a Retry button can resolve a transient failure', async () => {
    /**
     * The Retry button after a chat-send failure and the Refresh button in
     * LocalBlock both need to re-probe without re-mounting the hook. A
     * useState refreshKey toggles the effect; this asserts that round-trip.
     */
    probeMock.mockResolvedValueOnce({ ok: false, reason: 'connection-refused' })
    const { result } = renderHook(() => useLocalModels('http://localhost:1234/v1'))
    await waitFor(() => expect(result.current.error).toBe('connection-refused'))

    probeMock.mockResolvedValueOnce({ ok: true, models: [{ id: 'gemma', displayName: 'gemma' }] })
    act(() => result.current.refresh())
    await waitFor(() => {
      expect(result.current.error).toBeNull()
      expect(result.current.models).toEqual([
        { id: 'gemma', displayName: 'gemma', loadedContextLength: null, maxContextLength: null },
      ])
    })
    expect(probeMock).toHaveBeenCalledTimes(2)
  })

  it('merges loaded/max context length from /api/v1/models when LM Studio reports it', async () => {
    /**
     * The whole reason `fetchLoadedModelDetails` exists: warn the user
     * about a too-small context window before they hit a chat-time
     * CONTEXT_TOO_LARGE. The hook stitches the OpenAI-compat /v1/models
     * list (source of truth for "what's loaded") with the LMS-native
     * /api/v1/models payload (carrier of the context numbers) by id.
     */
    probeMock.mockResolvedValueOnce({
      ok: true,
      models: [
        { id: 'google/gemma-4-e4b', displayName: 'google/gemma-4-e4b' },
        { id: 'qwen-2-7b', displayName: 'qwen-2-7b' },
      ],
    })
    fetchLoadedModelDetailsMock.mockResolvedValueOnce([
      { id: 'google/gemma-4-e4b', loadedContextLength: 4096, maxContextLength: 32768 },
      // qwen-2-7b intentionally absent — proves the merge tolerates a
      // partial /api/v1 payload (which can happen if LM Studio's native
      // API only knows about loaded models).
    ])
    const { result } = renderHook(() => useLocalModels('http://localhost:1234/v1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.models).toEqual([
      { id: 'google/gemma-4-e4b', displayName: 'google/gemma-4-e4b', loadedContextLength: 4096, maxContextLength: 32768 },
      { id: 'qwen-2-7b', displayName: 'qwen-2-7b', loadedContextLength: null, maxContextLength: null },
    ])
  })

  it('keeps loadedContextLength null when /api/v1/models is unreachable (Ollama / non-LM-Studio runtimes)', async () => {
    /**
     * The native API call returns `[]` on 404 / timeout / non-LM-Studio
     * (handled inside `fetchLoadedModelDetails`). The hook must keep the
     * model list intact and silently leave context fields null — no
     * spurious warning row in LocalBlock for users on Ollama.
     */
    probeMock.mockResolvedValueOnce({
      ok: true,
      models: [{ id: 'gemma', displayName: 'gemma' }],
    })
    fetchLoadedModelDetailsMock.mockResolvedValueOnce([])
    const { result } = renderHook(() => useLocalModels('http://localhost:1234/v1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.models).toEqual([
      { id: 'gemma', displayName: 'gemma', loadedContextLength: null, maxContextLength: null },
    ])
  })
})

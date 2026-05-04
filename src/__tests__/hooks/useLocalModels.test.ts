import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

/**
 * Mock the underlying probe so the hook test never touches the network and
 * never depends on localServer's SSE / fetch logic. Each test pushes the
 * desired probe result via `probeMock.mockResolvedValueOnce(...)`.
 */
const { probeMock } = vi.hoisted(() => ({
  probeMock: vi.fn(),
}))
vi.mock('../../services/localServer', () => ({
  probe: probeMock,
}))

import { useLocalModels } from '../../hooks/useLocalModels'

beforeEach(() => {
  probeMock.mockReset()
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
    expect(result.current.models).toEqual([{ id: 'gemma-2-2b', displayName: 'gemma-2-2b' }])
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
      expect(result.current.models).toEqual([{ id: 'gemma', displayName: 'gemma' }])
    })
    expect(probeMock).toHaveBeenCalledTimes(2)
  })
})

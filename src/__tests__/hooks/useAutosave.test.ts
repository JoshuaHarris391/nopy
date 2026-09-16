import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutosave } from '../../hooks/useAutosave'

describe('useAutosave.flush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves immediately when dirty and cancels the pending debounce', async () => {
    /**
     * The editor debounces saves by 1.5s. Turning the page or closing the
     * editor inside that window used to drop the last edits, because leaving
     * cancelled the timer without saving. flush() is what those actions call
     * first: it must run the save right away and not let the timer fire a
     * second time afterwards.
     *
     * Input: markDirty(), then flush() before any time passes, then 2s pass.
     * Expected: save called exactly once.
     */
    const save = vi.fn(async () => {})
    const { result } = renderHook(() => useAutosave(save, []))

    act(() => result.current.markDirty())
    await act(async () => {
      await result.current.flush()
    })
    expect(save).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is nothing to save', async () => {
    /**
     * flush() runs before every page turn. With no edits pending it must not
     * write the file again; otherwise every flick through the diary would
     * rewrite an unchanged entry.
     *
     * Input: flush() on a clean hook.
     * Expected: save never called.
     */
    const save = vi.fn(async () => {})
    const { result } = renderHook(() => useAutosave(save, []))

    await act(async () => {
      await result.current.flush()
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('still autosaves on the debounce when not flushed', () => {
    /**
     * Regression guard for the existing behaviour: with no flush, typing then
     * pausing for 1.5s saves once.
     *
     * Input: markDirty(), 1500ms pass.
     * Expected: save called once.
     */
    const save = vi.fn(async () => {})
    const { result } = renderHook(() => useAutosave(save, []))

    act(() => result.current.markDirty())
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(save).toHaveBeenCalledTimes(1)
  })
})

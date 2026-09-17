import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { useRef } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { useRememberedState, useRememberedScroll } from '../../hooks/usePageMemory'
import { usePageMemoryStore } from '../../stores/pageMemoryStore'

/** A page with one remembered filter and a scroll pane, like the Index. */
function Page({ ready = true }: { ready?: boolean }) {
  const [query, setQuery] = useRememberedState('query', '')
  const ref = useRef<HTMLDivElement>(null)
  const { onScroll } = useRememberedScroll(ref, ready)
  return (
    <div>
      <input aria-label="Query" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div ref={ref} onScroll={onScroll} data-testid="pane" style={{ overflowY: 'auto', height: 100 }}>
        <div style={{ height: 2000 }} />
      </div>
    </div>
  )
}

/** MemoryRouter gives its first location the key "default", so every mount here shares one page memory. */
const mount = (ready?: boolean) =>
  render(<MemoryRouter><Page ready={ready} /></MemoryRouter>)

const pane = () => screen.getByTestId('pane')
const query = () => screen.getByLabelText('Query') as HTMLInputElement

describe('Page memory hooks', () => {
  beforeEach(() => {
    usePageMemoryStore.getState().clear()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('a remounted page comes back with the value and scroll it was left with', () => {
    /**
     * Leaving a page unmounts it, and React state dies with it. The hooks
     * put the value and the scroll offset in the page memory under the
     * location key, so mounting the same location again starts from them,
     * with the scroll applied before paint.
     *
     * Input: type "rain", scroll to 240, unmount; mount again.
     * Expected: the input reads "rain" on first render and the pane sits at 240.
     */
    const first = mount()
    fireEvent.change(query(), { target: { value: 'rain' } })
    pane().scrollTop = 240
    fireEvent.scroll(pane())
    first.unmount()

    mount()
    expect(query().value).toBe('rain')
    expect(pane().scrollTop).toBe(240)
  })

  it('the final offset is saved on unmount even if no scroll event fired', () => {
    /**
     * The last scroll may not have produced an event the hook saw (the
     * animation frame was still pending, or the browser scrolled the pane
     * itself). The unmount save captures whatever the pane says at the end.
     *
     * Input: set scrollTop to 90 with no scroll event, unmount.
     * Expected: memory holds 90 for the page.
     */
    const view = mount()
    pane().scrollTop = 90
    view.unmount()
    expect(usePageMemoryStore.getState().pages.default.scrollTop).toBe(90)
  })

  it('waits for the page to be ready before restoring, and restores once', () => {
    /**
     * A list that is still loading has no height to scroll into. The
     * restore waits for `ready`, then applies the remembered offset a single
     * time, so a later toggle of readiness (or the reader scrolling away)
     * never jumps the pane back.
     *
     * Input: memory holds 240; mount with ready=false, then ready=true,
     * scroll to 10, and flip ready off and on again.
     * Expected: 0 while not ready, 240 once ready, 10 after the reader moved.
     */
    usePageMemoryStore.getState().rememberScroll('default', 240)
    const view = render(<MemoryRouter><Page ready={false} /></MemoryRouter>)
    expect(pane().scrollTop).toBe(0)

    view.rerender(<MemoryRouter><Page ready /></MemoryRouter>)
    expect(pane().scrollTop).toBe(240)

    pane().scrollTop = 10
    view.rerender(<MemoryRouter><Page ready={false} /></MemoryRouter>)
    view.rerender(<MemoryRouter><Page ready /></MemoryRouter>)
    expect(pane().scrollTop).toBe(10)
  })
})

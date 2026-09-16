import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MonthScroll } from '../../components/journal/books/MonthScroll'
import { useJournalStore } from '../../stores/journalStore'
import { useJournalNavStore } from '../../stores/journalNavStore'
import type { JournalEntry } from '../../types/journal'

const SEP = { year: 2026, month: 9 }
const IDS = ['one', 'two', 'three']

function seed(id: string, day: number): JournalEntry {
  const d = new Date(2026, 8, day, 9, 0)
  return {
    id, title: `Entry ${id}`, content: 'words', createdAt: d.toISOString(), updatedAt: d.toISOString(),
    mood: null, tags: [], summary: null, indexed: false,
  }
}

const entries = IDS.map((id, i) => seed(id, 20 - i))

function renderMonth() {
  return render(
    <MemoryRouter>
      <MonthScroll month={SEP} entries={entries} isCurrentMonth={false} journalEmpty={false} onNewEntry={() => {}} />
    </MemoryRouter>,
  )
}

const panel = (container: HTMLElement) => container.querySelector<HTMLElement>('#month-panel')!
const card = (container: HTMLElement, id: string) => container.querySelector<HTMLElement>(`[data-entry-id="${id}"]`)!

describe('MonthScroll puts the reader back where they were', () => {
  beforeEach(() => {
    useJournalStore.setState({ entries, loaded: true })
    useJournalNavStore.getState().clear()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('restores the remembered scroll offset for the same month, without the entrance animation', () => {
    /**
     * Opening an entry and coming back used to land at the top of the list
     * and replay the staggered card animation. The nav store remembers the
     * month and offset; a fresh mount of the same month jumps straight there
     * and renders the cards without animating them in.
     *
     * Input: nav store remembers September at 420px; render September.
     * Expected: the panel's scrollTop is 420 and no card animates.
     */
    useJournalNavStore.getState().rememberScroll(SEP, 420)
    const { container } = renderMonth()

    expect(panel(container).scrollTop).toBe(420)
    expect(card(container, 'one').style.animation).toBe('none')
  })

  it('scrolls to and highlights the entry the reader just closed', () => {
    /**
     * Coming back from an entry (possibly in a different month than the one
     * the reader started in), the card for that entry is scrolled into view
     * and pulses briefly so the eye lands on it. The reveal request is
     * consumed so a later tab switch does not repeat it.
     *
     * Input: revealEntryId = "two"; render September; 1.7s pass.
     * Expected: scrollIntoView called on "two"'s card with block center; the
     * card carries the returned class, then loses it; revealEntryId is null.
     */
    vi.useFakeTimers()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    useJournalNavStore.getState().setRevealEntry('two')

    const { container } = renderMonth()

    expect(spy).toHaveBeenCalledWith({ block: 'center' })
    expect((spy.mock.contexts[0] as Element).getAttribute('data-entry-id')).toBe('two')
    expect(card(container, 'two').firstElementChild).toHaveClass('entry-card--returned')
    expect(useJournalNavStore.getState().revealEntryId).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1700)
    })
    expect(card(container, 'two').firstElementChild).not.toHaveClass('entry-card--returned')
  })

  it('starts a freshly opened month at the top with the entrance animation', () => {
    /**
     * With nothing remembered for this month the page reads as newly opened.
     *
     * Input: empty nav store; render September.
     * Expected: scrollTop 0 and the first card animates in.
     */
    const { container } = renderMonth()
    expect(panel(container).scrollTop).toBe(0)
    expect(card(container, 'one').style.animation).toContain('cardIn')
  })

  it('remembers the offset while scrolling and again on unmount', () => {
    /**
     * The offset is saved as the reader scrolls (throttled to animation
     * frames) and once more when the page is left, so whatever caused the
     * unmount (opening an entry, switching tabs) the last position survives.
     *
     * Input: scroll to 300, then set 350 and unmount.
     * Expected: the store holds 300, then 350, for September.
     */
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    const { container, unmount } = renderMonth()
    const el = panel(container)

    el.scrollTop = 300
    fireEvent.scroll(el)
    expect(useJournalNavStore.getState()).toMatchObject({ lastMonth: SEP, scrollTop: 300 })

    el.scrollTop = 350
    unmount()
    expect(useJournalNavStore.getState()).toMatchObject({ lastMonth: SEP, scrollTop: 350 })
    vi.unstubAllGlobals()
  })
})

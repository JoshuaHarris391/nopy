import { describe, it, expect, beforeEach } from 'vitest'
import { useNavigationStore, selectCanGoBack, selectPrevious, ROOT_STATE } from '../../stores/navigationStore'
import { usePageMemoryStore } from '../../stores/pageMemoryStore'

const at = (key: string, pathname: string, state: unknown = null) => ({ key, pathname, state })
const nav = () => useNavigationStore.getState()

describe('navigationStore mirrors the router history', () => {
  beforeEach(() => {
    useNavigationStore.setState({ entries: [], index: -1 })
    usePageMemoryStore.getState().clear()
  })

  it('treats the first page of a session as a root with nothing behind it', () => {
    /**
     * The router reports the first location as a POP. There is no page to
     * go back to, so no arrow should show, whatever the page is.
     *
     * Input: sync /journal/books/2026/09 as POP on an empty store.
     * Expected: one root entry, index 0, cannot go back, no previous.
     */
    nav().sync(at('default', '/journal/books/2026/09'), 'POP')
    expect(nav().entries).toEqual([{ key: 'default', pathname: '/journal/books/2026/09', root: true }])
    expect(selectCanGoBack(nav())).toBe(false)
    expect(selectPrevious(nav())).toBeNull()
  })

  it('a push from content can go back; a push from the rail cannot', () => {
    /**
     * Sidebar and BottomNav links carry ROOT_STATE so the pages they open
     * count as places the reader chose, not places they drilled into. A
     * plain push (a row, a card, a link) is one level in and can go back.
     *
     * Input: root at /index; push /journal/abc (content); push /chat with
     * ROOT_STATE.
     * Expected: on the entry, canGoBack with previous /index; on Chat, not.
     */
    nav().sync(at('k0', '/index'), 'POP')
    nav().sync(at('k1', '/journal/abc'), 'PUSH')
    expect(selectCanGoBack(nav())).toBe(true)
    expect(selectPrevious(nav())?.pathname).toBe('/index')

    nav().sync(at('k2', '/chat', ROOT_STATE), 'PUSH')
    expect(selectCanGoBack(nav())).toBe(false)
  })

  it('a replace keeps the intent of the page it replaces', () => {
    /**
     * /journal chosen from the rail redirects (replace) to the current
     * month. That month is still a root: the reader picked Journal, and the
     * arrow must not appear because of an internal redirect. A page flip in
     * the editor also replaces, and stays drilled-in.
     *
     * Input: root /index; push /journal with ROOT_STATE; replace it with the
     * month. Then push /journal/a from content and replace with /journal/b.
     * Expected: month is root (no back); /journal/b can go back to the month.
     */
    nav().sync(at('k0', '/index'), 'POP')
    nav().sync(at('k1', '/journal', ROOT_STATE), 'PUSH')
    nav().sync(at('k2', '/journal/books/2026/09'), 'REPLACE')
    expect(nav().entries[1]).toEqual({ key: 'k2', pathname: '/journal/books/2026/09', root: true })
    expect(selectCanGoBack(nav())).toBe(false)

    nav().sync(at('k3', '/journal/a'), 'PUSH')
    nav().sync(at('k4', '/journal/b'), 'REPLACE')
    expect(selectCanGoBack(nav())).toBe(true)
    expect(selectPrevious(nav())?.pathname).toBe('/journal/books/2026/09')
  })

  it('going back then pushing discards the forward pages and their memory', () => {
    /**
     * Like the browser: after Back, a new push throws away the forward
     * stack. Those pages can never be reached again, so what they remembered
     * is dropped with them; the pages that remain keep theirs.
     *
     * Input: root A, push B, push C; remember scroll for all three; POP to A;
     * push D.
     * Expected: entries are A, D; memory holds A only.
     */
    nav().sync(at('a', '/index'), 'POP')
    nav().sync(at('b', '/journal/1'), 'PUSH')
    nav().sync(at('c', '/chat'), 'PUSH')
    for (const k of ['a', 'b', 'c']) usePageMemoryStore.getState().rememberScroll(k, 100)

    nav().sync(at('a', '/index'), 'POP')
    expect(nav().index).toBe(0)
    expect(selectCanGoBack(nav())).toBe(false)

    nav().sync(at('d', '/insights'), 'PUSH')
    expect(nav().entries.map((e) => e.key)).toEqual(['a', 'd'])
    expect(Object.keys(usePageMemoryStore.getState().pages)).toEqual(['a'])
  })

  it('ignores a repeated sync of the same location, as StrictMode causes', () => {
    /**
     * React runs effects twice in development. The second call for the same
     * location must not push a duplicate entry.
     *
     * Input: root A; push B twice with the same key.
     * Expected: two entries, index 1.
     */
    nav().sync(at('a', '/index'), 'POP')
    nav().sync(at('b', '/journal/1'), 'PUSH')
    nav().sync(at('b', '/journal/1'), 'PUSH')
    expect(nav().entries).toHaveLength(2)
    expect(nav().index).toBe(1)
  })

  it('clear keeps only the page the reader is standing on, as a root', () => {
    /**
     * Switching journals invalidates every page behind the current one (they
     * list entries of the old journal), but the reader is still looking at
     * some page. It becomes the new start of the session.
     *
     * Input: root A, push B; clear.
     * Expected: one root entry for B, no back.
     */
    nav().sync(at('a', '/index'), 'POP')
    nav().sync(at('b', '/journal/1'), 'PUSH')
    nav().clear()
    expect(nav().entries).toEqual([{ key: 'b', pathname: '/journal/1', root: true }])
    expect(selectCanGoBack(nav())).toBe(false)
  })
})

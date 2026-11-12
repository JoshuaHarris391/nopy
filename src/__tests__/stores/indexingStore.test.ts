import { describe, it, expect, beforeEach } from 'vitest'
import { useIndexingStore } from '../../stores/indexingStore'
import { useNotificationStore } from '../../stores/notificationStore'

beforeEach(() => {
  useNotificationStore.getState().clear()
  useIndexingStore.setState({ state: 'idle', result: null, error: null, failures: {} })
})

describe('What the writer is told when an indexing run ends', () => {
  it('says "Already up to date" only when there was nothing to index', async () => {
    /**
     * "Already up to date" used to appear whenever zero entries were saved,
     * which included runs where every entry had failed. It must now mean
     * exactly one thing: no entry needed indexing.
     * Input: a run that attempted nothing, then a run that indexed 2 of 2.
     * Expected: "Already up to date", then "2 entries indexed".
     */
    await useIndexingStore.getState().run(async () => ({ attempted: 0, indexed: 0, failed: [] }))
    expect(useIndexingStore.getState()).toMatchObject({ state: 'done', result: 'Already up to date' })

    await useIndexingStore.getState().run(async () => ({ attempted: 2, indexed: 2, failed: [] }))
    expect(useIndexingStore.getState()).toMatchObject({ state: 'done', result: '2 entries indexed' })
  })

  it('reports a partly failed run with the entries that failed and why', async () => {
    /**
     * When some entries fail, the count next to the button is not enough:
     * the writer needs to know which entries and the reason, and the Index
     * page needs the list to mark those rows.
     * Input: a run that indexed 2 entries and failed on "Tuesday".
     * Expected: the inline result gives both counts, an error notification
     * names Tuesday and its reason, and the store remembers the failure
     * against the entry id.
     */
    await useIndexingStore.getState().run(async () => ({
      attempted: 3,
      indexed: 2,
      failed: [{ id: 'b', title: 'Tuesday', reason: 'The response was not valid JSON.' }],
    }))

    const state = useIndexingStore.getState()
    expect(state).toMatchObject({ state: 'done', result: '2 indexed, 1 failed' })
    expect(state.failures).toEqual({ b: 'The response was not valid JSON.' })
    const notice = useNotificationStore.getState().items.find((n) => n.kind === 'error')
    expect(notice?.message).toContain('Tuesday')
    expect(notice?.message).toContain('The response was not valid JSON.')
  })

  it('ends in an error, not a success, when every entry failed', async () => {
    /**
     * A run that saved nothing is a failure and has to look like one, with
     * the reason on screen, so the writer does not keep pressing the button.
     * Input: a run that attempted 2 entries and failed both.
     * Expected: the error state, with a message carrying the first reason,
     * and an error notification.
     */
    await useIndexingStore.getState().run(async () => ({
      attempted: 2,
      indexed: 0,
      failed: [
        { id: 'a', title: 'Monday', reason: 'The model ran out of output tokens.' },
        { id: 'b', title: 'Tuesday', reason: 'The model ran out of output tokens.' },
      ],
    }))

    const state = useIndexingStore.getState()
    expect(state.state).toBe('error')
    expect(state.error).toContain('The model ran out of output tokens.')
    expect(useNotificationStore.getState().items.some((n) => n.kind === 'error')).toBe(true)
  })
})

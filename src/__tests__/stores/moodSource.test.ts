import { describe, it, expect, beforeEach, vi } from 'vitest'

const idbStore = new Map<unknown, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: unknown) => idbStore.get(key)),
  set: vi.fn(async (key: unknown, value: unknown) => {
    idbStore.set(key, value)
  }),
  del: vi.fn(async (key: unknown) => {
    idbStore.delete(key)
  }),
}))

import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { makeEntry, makeInsight } from '../fixtures/insight'
import type { ProcessedEntry } from '../../services/entryProcessor'

const indexerResult = (moodValue: number): ProcessedEntry => ({
  mood: { value: moodValue, label: 'good' },
  domains: ['work'],
  summary: 'Indexed.',
  insight: makeInsight({ inferredMood: moodValue }),
  indexModel: 'test',
})

beforeEach(() => {
  idbStore.clear()
  useSettingsStore.setState({ journalPath: '' })
})

describe('The writer\'s mood is never overwritten by the indexer', () => {
  it('keeps a writer-rated mood, replaces an indexer-set one, and fills a missing one', async () => {
    /**
     * The mood a person picks on an entry is the one human-determined
     * metric in the whole record, so indexing must leave it alone. A mood
     * the indexer set on a previous run is only an estimate, so a re-index
     * refreshes it. An entry with no mood takes the indexer's estimate and
     * is marked as such, so the next re-index can refresh it too.
     *
     * Input: three entries — writer-rated 4, indexer-set 6, no mood — each
     * indexed with an indexer estimate of 8.
     * Expected: 4 (writer) unchanged; 6 becomes 8 (indexer); null becomes 8
     * (indexer). The indexer's estimate is kept in insight.inferredMood on
     * all three.
     */
    useJournalStore.setState({
      entries: [
        makeEntry({ id: 'writer', mood: { value: 4, label: 'low' }, moodSource: 'writer', insight: null, indexed: false }),
        makeEntry({ id: 'indexer', mood: { value: 6, label: 'good' }, moodSource: 'indexer', insight: null, indexed: false }),
        makeEntry({ id: 'none', mood: null, moodSource: null, insight: null, indexed: false }),
      ],
      loaded: true,
    })

    await useJournalStore.getState().applyProcessedMetadata(new Map([
      ['writer', indexerResult(8)],
      ['indexer', indexerResult(8)],
      ['none', indexerResult(8)],
    ]))

    const byId = Object.fromEntries(useJournalStore.getState().entries.map((e) => [e.id, e]))
    expect(byId.writer.mood?.value).toBe(4)
    expect(byId.writer.moodSource).toBe('writer')
    expect(byId.indexer.mood?.value).toBe(8)
    expect(byId.indexer.moodSource).toBe('indexer')
    expect(byId.none.mood?.value).toBe(8)
    expect(byId.none.moodSource).toBe('indexer')
    for (const id of ['writer', 'indexer', 'none']) expect(byId[id].insight?.inferredMood).toBe(8)
  })

  it('treats a legacy mood with no source as the writer\'s', async () => {
    /**
     * Entries saved before the source flag existed have a mood but no
     * record of who set it. Erring on the side of the person, they are
     * treated as writer-rated so nothing a human chose is lost.
     * Input: an entry with mood 3 and no moodSource, indexed with estimate 9.
     * Expected: mood stays 3 and is now marked writer-rated.
     */
    useJournalStore.setState({
      entries: [makeEntry({ id: 'legacy', mood: { value: 3, label: 'mixed' }, moodSource: undefined, insight: null, indexVersion: 1 })],
      loaded: true,
    })
    await useJournalStore.getState().applyProcessedMetadata(new Map([['legacy', indexerResult(9)]]))
    const entry = useJournalStore.getState().entries[0]
    expect(entry.mood?.value).toBe(3)
    expect(entry.moodSource).toBe('writer')
  })
})

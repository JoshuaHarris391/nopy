import { describe, it, expect } from 'vitest'
import {
  bucketEntries, moodSeries, stateSeries, emotionSeries, domainSeries, bodySeries, windowSummary, safetyRows,
} from '../../services/insightSeries'
import { getWindow, granularityFor, bucketBounds } from '../../utils/timeSeries'
import { makeEntry, makeInsight } from '../fixtures/insight'

const NOW = new Date('2025-03-20T12:00:00.000Z')

describe('Bucketing a window', () => {
  it('splits a month into clipped weeks and a year into months, keeping empty buckets', () => {
    /**
     * Every chart shares one bucket grid per window so their x positions
     * line up. A month is bucketed by week (Monday start, clipped to the
     * month) and a year by month; buckets with no entries are kept.
     * Input: March 2025 (starts on a Saturday) and the year 2025, with two
     * entries on 3 and 4 March.
     * Expected: March → 6 week buckets, the first starting on 1 March and
     * the last ending on 31 March; both entries in the bucket keyed
     * 2025-03-03; the year → 12 month buckets.
     */
    const month = getWindow('month', 0, { now: NOW })
    const weeks = bucketBounds(month, granularityFor('month'))
    expect(weeks).toHaveLength(6)
    expect(weeks[0].key).toBe('2025-03-01')
    expect(weeks[weeks.length - 1].end.toISOString().slice(0, 10)).toBe('2025-03-31')

    const entries = [
      makeEntry({ id: 'a', createdAt: '2025-03-03T09:00:00.000Z' }),
      makeEntry({ id: 'b', createdAt: '2025-03-04T09:00:00.000Z' }),
    ]
    const buckets = bucketEntries(entries, month, 'week')
    expect(buckets.find((b) => b.key === '2025-03-03')?.entries.map((e) => e.id)).toEqual(['a', 'b'])
    expect(buckets.filter((b) => b.entries.length === 0)).toHaveLength(5)

    const year = getWindow('year', 0, { now: NOW })
    expect(bucketBounds(year, granularityFor('year'))).toHaveLength(12)
  })
})

describe('Series over the structured index', () => {
  it('averages inferred states per bucket using confident values only', () => {
    /**
     * A state value the indexer was not confident about must not pull the
     * bucket mean around. Two March entries: anxiety 8 at 0.9 and 2 at 0.4.
     * Expected: one mean point of 8 with n 1; a state with no confident
     * values yields no points at all.
     */
    const confident = makeInsight()
    confident.states.anxiety = { value: 8, confidence: 0.9, evidence: 'terrified' }
    const weak = makeInsight()
    weak.states.anxiety = { value: 2, confidence: 0.4, evidence: 'maybe' }
    weak.states.meaning = { value: null, confidence: null, evidence: null }
    confident.states.meaning = { value: null, confidence: null, evidence: null }
    const buckets = bucketEntries([
      makeEntry({ createdAt: '2025-03-03T09:00:00.000Z', insight: confident }),
      makeEntry({ createdAt: '2025-03-04T09:00:00.000Z', insight: weak }),
    ], getWindow('month', 0, { now: NOW }), 'week')

    expect(stateSeries(buckets, 'anxiety').means).toEqual([expect.objectContaining({ value: 8, n: 1, bucketKey: '2025-03-03' })])
    expect(stateSeries(buckets, 'meaning').means).toEqual([])
  })

  it('keeps the top emotions over the whole window and folds the rest into other', () => {
    /**
     * Colours must stay stable across buckets, so the top-N is chosen over
     * the window, not per bucket. Counts are entries mentioning the label.
     * Input: three entries with anxious in all, sad in two, and one each of
     * four rarer labels; top = 2.
     * Expected: categories anxious, sad, other; the first entry's bucket
     * counts anxious 1, sad 1, other 2.
     */
    const e = (date: string, labels: string[]) => makeEntry({
      createdAt: date,
      insight: makeInsight({ emotions: labels.map((label) => ({ label: label as never, intensity: 5 })) }),
    })
    const buckets = bucketEntries([
      e('2025-03-03T09:00:00.000Z', ['anxious', 'sad', 'guilty', 'numb']),
      e('2025-03-10T09:00:00.000Z', ['anxious', 'sad', 'bored']),
      e('2025-03-17T09:00:00.000Z', ['anxious', 'hopeful']),
    ], getWindow('month', 0, { now: NOW }), 'week')
    const series = emotionSeries(buckets, 2)
    expect(series.categories).toEqual(['anxious', 'sad', 'other'])
    const first = series.buckets.find((b) => b.key === '2025-03-03')!
    expect(first.counts).toEqual({ anxious: 1, sad: 1, other: 2 })
    expect(first.total).toBe(4)
  })

  it('counts only closed domains so percent mode always sums to the bucket total', () => {
    /**
     * Legacy entries carry free-text tags that are not domains; only the
     * closed vocabulary is charted, over structured entries.
     * Input: a v2 entry tagged relationship+housing and a legacy entry
     * tagged "work stress" in the same week.
     * Expected: categories relationship and housing; the bucket total is 2.
     */
    const buckets = bucketEntries([
      makeEntry({ createdAt: '2025-03-03T09:00:00.000Z' }),
      makeEntry({ createdAt: '2025-03-04T09:00:00.000Z', insight: null, indexVersion: 1, tags: ['work stress'] }),
    ], getWindow('month', 0, { now: NOW }), 'week')
    const series = domainSeries(buckets)
    expect(series.categories.sort()).toEqual(['housing', 'relationship'])
    expect(series.buckets.find((b) => b.key === '2025-03-03')?.total).toBe(2)
  })

  it('builds sleep means and body event counts, and mood points tagged by source', () => {
    /**
     * Sleep is a per-entry line with bucket means; substances and symptoms
     * are counted per bucket; mood points say whether the writer rated them.
     * Input: two entries in one week, sleep 4h and 6h, one alcohol each,
     * one writer-rated mood and one indexer-set mood.
     * Expected: sleep mean 5 (n 2); alcohol count 2 in that bucket; mood
     * points with sources writer and inferred.
     */
    const buckets = bucketEntries([
      makeEntry({ createdAt: '2025-03-03T09:00:00.000Z' }),
      makeEntry({ createdAt: '2025-03-04T09:00:00.000Z', moodSource: 'indexer', insight: makeInsight({ body: { sleepHours: 6, sleepQuality: null, movement: null, substances: [{ type: 'alcohol', quantity: null }], symptoms: [], notes: null } }) }),
    ], getWindow('month', 0, { now: NOW }), 'week')
    const body = bodySeries(buckets)
    expect(body.sleepMeans).toEqual([expect.objectContaining({ value: 5, n: 2 })])
    expect(body.events.buckets.find((b) => b.key === '2025-03-03')?.counts.alcohol).toBe(2)
    expect(moodSeries(buckets).points.map((p) => p.source)).toEqual(['writer', 'inferred'])
  })

  it('summarises the window from writer ratings and lists safety flags', () => {
    /**
     * The average-mood card uses the writer's own ratings only; the
     * distribution counts every mood; safety flags are listed newest first.
     * Input: writer-rated 4 and 8, an indexer-set 2, one flagged "monitor".
     * Expected: average 6 over 2 writer-rated entries, three moods in the
     * distribution, one safety row.
     */
    const window = getWindow('month', 0, { now: NOW })
    const entries = [
      makeEntry({ id: 'w1', createdAt: '2025-03-03T09:00:00.000Z', mood: { value: 4, label: 'low' } }),
      makeEntry({ id: 'w2', createdAt: '2025-03-05T09:00:00.000Z', mood: { value: 8, label: 'good' }, insight: makeInsight({ safety: { flag: 'monitor', evidence: 'no point' } }) }),
      makeEntry({ id: 'i1', createdAt: '2025-03-07T09:00:00.000Z', mood: { value: 2, label: 'low' }, moodSource: 'indexer' }),
    ]
    const summary = windowSummary(entries, window)
    expect(summary.averageMood).toBe(6)
    expect(summary.writerRatedCount).toBe(2)
    expect(summary.distribution.reduce((s, d) => s + d.count, 0)).toBe(3)
    expect(summary.structuredCount).toBe(3)
    expect(summary.unindexedCount).toBe(0)
    expect(summary.staleCount).toBe(0)
    expect(safetyRows(entries, window)).toEqual([expect.objectContaining({ entryId: 'w2', flag: 'monitor', evidence: 'no point' })])
  })
})

describe('Coverage counts distinguish unindexed from stale entries', () => {
  it('counts a never-indexed entry as unindexed and a record-less indexed entry as stale', () => {
    /**
     * The coverage hint must send the reader to the right fix. A new entry
     * that has never been indexed is not a re-index problem, and Settings
     * (which counts stale entries) is right to show nothing for it.
     * Input: one unindexed entry, one v2 entry whose record was dropped,
     * one full v2 entry, all in March 2025.
     * Expected: unindexedCount 1, staleCount 1, structuredCount 1.
     */
    const window = getWindow('month', 0, { now: NOW })
    const summary = windowSummary([
      makeEntry({ id: 'new', createdAt: '2025-03-03T09:00:00.000Z', indexed: false, insight: null, indexVersion: 0 }),
      makeEntry({ id: 'dropped', createdAt: '2025-03-04T09:00:00.000Z', insight: null, indexVersion: 2 }),
      makeEntry({ id: 'ok', createdAt: '2025-03-05T09:00:00.000Z' }),
    ], window)
    expect(summary).toMatchObject({ entryCount: 3, structuredCount: 1, unindexedCount: 1, staleCount: 1 })
  })
})

import { describe, it, expect } from 'vitest'
import { computeLocalStats } from '../../services/entryProcessor'
import type { JournalEntry } from '../../types/journal'

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: crypto.randomUUID(),
    title: 'Test entry',
    content: 'Some content.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mood: null,
    tags: [],
    summary: null,
    indexed: false,
    ...overrides,
  }
}

function dateString(daysAgo: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString()
}

describe('computeLocalStats', () => {
  it('returns zeros for an empty entries array', () => {
    /**
     * computeLocalStats is called whenever a profile is generated. If the user
     * has no entries, the function must return safe zero values rather than
     * throwing or returning NaN, which would break profile rendering.
     * Input: []
     * Expected output: averageMood 0, journalingStreak 0, avgEntryLength 0, reflectionDepth "Low"
     */
    const stats = computeLocalStats([])
    expect(stats.averageMood).toBe(0)
    expect(stats.journalingStreak).toBe(0)
    expect(stats.avgEntryLength).toBe(0)
    expect(stats.reflectionDepth).toBe('Low')
  })

  it('returns zeros when no entries are indexed', () => {
    /**
     * averageMood is computed only from indexed entries (entries that have been
     * processed by the AI). If all entries are unindexed, mood should be 0.
     * journalingStreak and avgEntryLength use all entries, but the key
     * invariant here is that un-indexed entries do not pollute the mood average.
     * Input: two unindexed entries with mood scores
     * Expected output: averageMood 0 (mood on unindexed entries is irrelevant)
     */
    const entries = [
      makeEntry({ indexed: false, mood: { value: 7, label: 'good' } }),
      makeEntry({ indexed: false, mood: { value: 4, label: 'mixed' } }),
    ]
    const stats = computeLocalStats(entries)
    expect(stats.averageMood).toBe(0)
  })

  it('computes the correct average mood from indexed entries', () => {
    /**
     * averageMood should be the mean of mood.value across all indexed entries
     * that have a mood value, rounded to 1 decimal place. This is displayed
     * prominently on the profile page and must be accurate.
     * Input: three indexed entries with mood values 6, 8, 7
     * Expected output: averageMood === 7.0
     */
    const entries = [
      makeEntry({ indexed: true, mood: { value: 6, label: 'good' } }),
      makeEntry({ indexed: true, mood: { value: 8, label: 'great' } }),
      makeEntry({ indexed: true, mood: { value: 7, label: 'good' } }),
    ]
    const stats = computeLocalStats(entries)
    expect(stats.averageMood).toBe(7.0)
  })

  it('rounds averageMood to 1 decimal place', () => {
    /**
     * The average mood is rounded to 1 decimal place using Math.round(x * 10) / 10.
     * This test verifies that uneven averages are correctly rounded, not truncated.
     * Input: two indexed entries with mood values 6 and 7 → average 6.5
     * Expected output: averageMood === 6.5
     */
    const entries = [
      makeEntry({ indexed: true, mood: { value: 6, label: 'good' } }),
      makeEntry({ indexed: true, mood: { value: 7, label: 'good' } }),
    ]
    const stats = computeLocalStats(entries)
    expect(stats.averageMood).toBe(6.5)
  })

  it('excludes indexed entries with no mood value from the average', () => {
    /**
     * Some indexed entries may have mood: null (e.g. if the AI failed to score
     * them). These must be excluded from the average to avoid dividing by a
     * larger count and pulling the average down incorrectly.
     * Input: one indexed entry with mood value 8, one with mood: null
     * Expected output: averageMood === 8.0 (null entry excluded)
     */
    const entries = [
      makeEntry({ indexed: true, mood: { value: 8, label: 'great' } }),
      makeEntry({ indexed: true, mood: null }),
    ]
    const stats = computeLocalStats(entries)
    expect(stats.averageMood).toBe(8.0)
  })

  it('computes avgEntryLength as word count across all entries', () => {
    /**
     * avgEntryLength is the average word count across ALL entries (not just indexed),
     * because it measures the user's journaling behaviour, not the AI analysis.
     * Word count is computed by splitting on whitespace and filtering empty strings.
     * Input: two entries with content "one two three" (3 words) and "four five" (2 words)
     * Expected output: avgEntryLength === 2 (Math.round(5/2) = 3... wait: round((3+2)/2) = 3)
     *
     * Actually: round((3+2)/2) = round(2.5) = 3 in JS (rounds half up in most engines via Math.round)
     * Math.round(2.5) = 3 in JS
     */
    const entries = [
      makeEntry({ content: 'one two three', indexed: true }),
      makeEntry({ content: 'four five', indexed: true }),
    ]
    const stats = computeLocalStats(entries)
    expect(stats.avgEntryLength).toBe(Math.round((3 + 2) / 2))
  })

  it('classifies reflectionDepth as "Low" for avgEntryLength below 150', () => {
    /**
     * reflectionDepth is a qualitative classification of how deeply the user
     * reflects in their journal, based on average word count:
     *   - Low:    < 150 words
     *   - Medium: 150–299 words
     *   - High:   >= 300 words
     * A short entry (e.g. 10 words) should give "Low" reflection depth.
     * Input: one entry with 10 words
     * Expected output: reflectionDepth === "Low"
     */
    const shortContent = Array(10).fill('word').join(' ')
    const entries = [makeEntry({ content: shortContent, indexed: true })]
    const stats = computeLocalStats(entries)
    expect(stats.reflectionDepth).toBe('Low')
  })

  it('classifies reflectionDepth as "Medium" for avgEntryLength 150–299', () => {
    /**
     * An average of 150 words or more (but under 300) should yield "Medium"
     * reflection depth. This threshold represents a moderately detailed entry.
     * Input: one entry with exactly 150 words
     * Expected output: reflectionDepth === "Medium"
     */
    const mediumContent = Array(150).fill('word').join(' ')
    const entries = [makeEntry({ content: mediumContent, indexed: true })]
    const stats = computeLocalStats(entries)
    expect(stats.reflectionDepth).toBe('Medium')
  })

  it('classifies reflectionDepth as "High" for avgEntryLength >= 300', () => {
    /**
     * An average of 300 or more words indicates a deeply reflective journaling
     * habit. This is the highest classification and is shown as a positive
     * indicator on the profile page.
     * Input: one entry with exactly 300 words
     * Expected output: reflectionDepth === "High"
     */
    const longContent = Array(300).fill('word').join(' ')
    const entries = [makeEntry({ content: longContent, indexed: true })]
    const stats = computeLocalStats(entries)
    expect(stats.reflectionDepth).toBe('High')
  })

  it('counts a streak of 1 for a single entry written today', () => {
    /**
     * The journaling streak counts consecutive days of journaling up to and
     * including today. If the user wrote today, the streak is at least 1.
     * Note: computeLocalStats short-circuits to 0 when no entries are indexed,
     * so streak tests must use indexed: true.
     * Input: one indexed entry with createdAt = today
     * Expected output: journalingStreak >= 1
     */
    const entries = [makeEntry({ createdAt: dateString(0), indexed: true })]
    const stats = computeLocalStats(entries)
    expect(stats.journalingStreak).toBeGreaterThanOrEqual(1)
  })

  it('counts a streak of 3 for entries on today, yesterday, and two days ago', () => {
    /**
     * The streak algorithm walks backwards from today, checking whether each
     * preceding day has at least one entry. Three consecutive days should
     * give a streak of 3, regardless of how many entries are on each day.
     * Note: indexed: true is required or the function short-circuits to 0.
     * Input: indexed entries on day 0 (today), day 1 (yesterday), day 2 (two days ago)
     * Expected output: journalingStreak === 3
     */
    const entries = [
      makeEntry({ createdAt: dateString(0), indexed: true }),
      makeEntry({ createdAt: dateString(1), indexed: true }),
      makeEntry({ createdAt: dateString(2), indexed: true }),
    ]
    const stats = computeLocalStats(entries)
    expect(stats.journalingStreak).toBe(3)
  })

  it('breaks the streak at a gap in days', () => {
    /**
     * If there is a day with no entry between the most recent entry and an
     * older one, the streak should stop at the gap. This ensures the streak
     * represents genuinely consecutive days, not just total days with entries.
     * Note: indexed: true is required or the function short-circuits to 0.
     * Input: indexed entries on today (day 0) and two days ago (day 2) — day 1 is missing
     * Expected output: journalingStreak === 1 (only today counts)
     */
    const entries = [
      makeEntry({ createdAt: dateString(0), indexed: true }),
      makeEntry({ createdAt: dateString(2), indexed: true }),
    ]
    const stats = computeLocalStats(entries)
    expect(stats.journalingStreak).toBe(1)
  })

  it('deduplicates multiple entries on the same day for streak calculation', () => {
    /**
     * Multiple entries on the same date should count as a single day for the
     * streak. The algorithm uses a Set of unique date strings (YYYY-MM-DD),
     * so two entries on the same day should not count as two days.
     * Note: indexed: true is required or the function short-circuits to 0.
     * Input: two indexed entries on today, one indexed entry on yesterday
     * Expected output: journalingStreak === 2 (not 3)
     */
    const entries = [
      makeEntry({ createdAt: dateString(0), indexed: true }),
      makeEntry({ createdAt: dateString(0), indexed: true }),
      makeEntry({ createdAt: dateString(1), indexed: true }),
    ]
    const stats = computeLocalStats(entries)
    expect(stats.journalingStreak).toBe(2)
  })
})

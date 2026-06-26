import { describe, it, expect } from 'vitest'
import { formatUsage } from '../../utils/formatUsage'

describe('formatUsage', () => {
  it('shows only "in · out" when there are no cache tokens (pre prompt-caching)', () => {
    /**
     * Before the prompt-caching feature is active, every billed input token is
     * full-price, so the header reads as a plain `in · out`. Numbers use
     * thousands separators to stay legible at a glance in the header.
     */
    const label = formatUsage({
      inputTokens: 12450,
      outputTokens: 3210,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(label).toBe('12,450 in · 3,210 out')
  })

  it('inserts a combined "cached" figure (reads + writes) when caching is active', () => {
    /**
     * Once prompt caching kicks in, the repeated prefix moves into cheap cache
     * reads (plus the occasional write), so the full-price `in` number drops
     * and a `cached` segment appears between in and out — this is the visible
     * reduction users are meant to see. cacheRead + cacheWrite are summed into
     * one figure to keep the header compact.
     */
    const label = formatUsage({
      inputTokens: 1150,
      outputTokens: 3210,
      cacheReadTokens: 11000,
      cacheWriteTokens: 300,
    })
    expect(label).toBe('1,150 in · 11,300 cached · 3,210 out')
  })

  it('returns null when usage is unknown so the caller can hide the stat', () => {
    /**
     * A fresh session, or one run against a provider that doesn't report billed
     * usage (OpenAI/local), has no usage to show. Returning null lets ChatView
     * omit the header stat entirely rather than render a misleading "0 in".
     */
    expect(formatUsage(undefined)).toBeNull()
  })
})

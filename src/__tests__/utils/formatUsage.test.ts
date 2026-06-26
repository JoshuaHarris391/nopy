import { describe, it, expect } from 'vitest'
import { estimateBilledTokens, formatUsage, usageBreakdown } from '../../utils/formatUsage'

describe('estimateBilledTokens', () => {
  it('counts full-price input and output 1:1', () => {
    /**
     * The simplest case (no caching): every input and output token is billed at
     * face value, so the estimate is just their sum.
     */
    const billed = estimateBilledTokens({
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(billed).toBe(1200)
  })

  it('discounts cache reads to ~0.1x and surcharges writes to ~1.25x', () => {
    /**
     * This is the whole point of the feature: a prompt served from cache should
     * barely register. 10,000 tokens read from cache bill like ~1,000; the same
     * 10,000 written to cache bill like ~12,500 (the one-time write premium).
     * Getting these weights wrong would make the header misrepresent the saving.
     */
    expect(
      estimateBilledTokens({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 10000, cacheWriteTokens: 0 }),
    ).toBe(1000)
    expect(
      estimateBilledTokens({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 10000 }),
    ).toBe(12500)
  })

  it('makes a cache-served follow-up turn add far fewer billed tokens than the first turn', () => {
    /**
     * Models the real scenario that confused us: a ~30K system prompt. Turn 1
     * writes it to cache (expensive, once); turn 2 reads it (cheap). The billed
     * total must jump on turn 1 and barely move on turn 2 — otherwise the header
     * still looks like cost is doubling.
     */
    const afterTurn1 = estimateBilledTokens({
      inputTokens: 2, outputTokens: 18, cacheReadTokens: 0, cacheWriteTokens: 30000,
    })
    const afterTurn2 = estimateBilledTokens({
      inputTokens: 4, outputTokens: 56, cacheReadTokens: 30000, cacheWriteTokens: 30024,
    })
    const turn2Increment = afterTurn2 - afterTurn1
    // Turn 1 billed ~37.5K; turn 2 only adds the cheap read (~3K), not another 30K.
    expect(afterTurn1).toBe(37520)
    expect(turn2Increment).toBeLessThan(4000)
  })
})

describe('formatUsage', () => {
  it('formats the cache-adjusted billed total', () => {
    // 2 + 24*1.25 + 112000*0.1 + 56 = 2 + 30 + 11200 + 56 = 11,288
    expect(
      formatUsage({ inputTokens: 2, outputTokens: 56, cacheReadTokens: 112000, cacheWriteTokens: 24 }),
    ).toBe('~11,288 tokens billed')
  })

  it('returns null when usage is unknown so the caller can hide the stat', () => {
    /**
     * A fresh session, or one run against a provider that doesn't report billed
     * usage (OpenAI/local), has nothing to show. Returning null lets ChatView
     * omit the header stat rather than render a misleading "0".
     */
    expect(formatUsage(undefined)).toBeNull()
  })
})

describe('usageBreakdown', () => {
  it('lists the raw four components for the tooltip', () => {
    /**
     * The headline number is cache-adjusted, so the tooltip exposes the real
     * per-type counts for anyone who wants to verify the estimate.
     */
    expect(
      usageBreakdown({ inputTokens: 2, outputTokens: 56, cacheReadTokens: 112000, cacheWriteTokens: 24 }),
    ).toBe('2 full-price in · 112,000 cache read · 24 cache write · 56 out')
  })
})

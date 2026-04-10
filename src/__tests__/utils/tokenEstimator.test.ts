import { describe, it, expect } from 'vitest'
import { estimateTokens } from '../../utils/tokenEstimator'

describe('estimateTokens', () => {
  it('returns 0 for an empty string', () => {
    /**
     * The token estimator is used to budget context window usage in the
     * contextAssembler. An empty string has 0 characters so must produce 0
     * tokens — otherwise the budget calculation would be inflated at the start.
     * Input: ""
     * Expected output: 0
     */
    expect(estimateTokens('')).toBe(0)
  })

  it('returns 1 for a single character', () => {
    /**
     * The estimator uses ceil(length / 4). A single character has length 1,
     * so ceil(1 / 4) = ceil(0.25) = 1. This is the smallest non-zero token count.
     * Input: "a"
     * Expected output: 1
     */
    expect(estimateTokens('a')).toBe(1)
  })

  it('returns the exact integer for a string that divides evenly by 4', () => {
    /**
     * For strings whose length is divisible by 4, no rounding is needed.
     * "abcd" has length 4, so ceil(4/4) = 1. "abcdefgh" has length 8, ceil(8/4) = 2.
     * This confirms the formula works without floating point noise.
     * Input: "abcdefgh" (length 8)
     * Expected output: 2
     */
    expect(estimateTokens('abcdefgh')).toBe(2)
  })

  it('rounds up for strings that do not divide evenly by 4', () => {
    /**
     * Most real text will not divide evenly by 4. The ceil() ensures we
     * over-estimate rather than under-estimate token usage, which is the
     * safe direction for a context budget guard.
     * Input: "hello" (length 5), ceil(5/4) = ceil(1.25) = 2
     * Expected output: 2
     */
    expect(estimateTokens('hello')).toBe(2)
  })

  it('estimates a realistic short message correctly', () => {
    /**
     * Validates the estimator on a real-world-length string. "Hello, how are you?"
     * has 19 characters, ceil(19/4) = ceil(4.75) = 5.
     * This gives confidence the formula handles typical chat message lengths.
     * Input: "Hello, how are you?" (length 19)
     * Expected output: 5
     */
    const text = 'Hello, how are you?'
    expect(estimateTokens(text)).toBe(Math.ceil(text.length / 4))
  })
})

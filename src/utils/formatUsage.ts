import type { ChatUsage } from '../types/chat'

// Anthropic prompt-caching price multipliers, relative to the base input rate:
// a cache write costs ~1.25x a normal input token and a cache read ~0.1x.
// We fold these into a single "tokens billed" estimate so the header reflects
// what's actually charged — a turn served from cache adds almost nothing, which
// is how the caching saving becomes visible.
const CACHE_WRITE_MULTIPLIER = 1.25
const CACHE_READ_MULTIPLIER = 0.1

/**
 * Estimated total tokens billed for the conversation, cache-adjusted. Full-price
 * input and output count 1:1; cache writes count 1.25x and cache reads 0.1x.
 * The raw four-component usage is what we persist (the accurate source); this is
 * derived for display only, so the multipliers can change without a migration.
 *
 * Without caching this grows by the full prompt every turn; with caching the
 * repeated prefix becomes cheap reads, so the number barely moves on follow-up
 * turns — the visible reduction.
 */
export function estimateBilledTokens(usage: ChatUsage): number {
  return Math.round(
    usage.inputTokens +
      usage.cacheWriteTokens * CACHE_WRITE_MULTIPLIER +
      usage.cacheReadTokens * CACHE_READ_MULTIPLIER +
      usage.outputTokens,
  )
}

/**
 * Header label for the conversation's billed usage, e.g. "~46,300 tokens billed".
 * Returns null when usage is unknown (a fresh session, or a provider that doesn't
 * report usage) so the caller can hide the stat.
 */
export function formatUsage(usage: ChatUsage | undefined): string | null {
  if (!usage) return null
  return `~${estimateBilledTokens(usage).toLocaleString()} tokens billed`
}

/** Raw component breakdown for the header tooltip. */
export function usageBreakdown(usage: ChatUsage): string {
  return [
    `${usage.inputTokens.toLocaleString()} full-price in`,
    `${usage.cacheReadTokens.toLocaleString()} cache read`,
    `${usage.cacheWriteTokens.toLocaleString()} cache write`,
    `${usage.outputTokens.toLocaleString()} out`,
  ].join(' · ')
}

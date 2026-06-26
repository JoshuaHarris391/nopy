import type { ChatUsage } from '../types/chat'

/**
 * Render a session's billed token usage for the chat header. Shows the real
 * input and output token totals; when prompt-caching tokens are present, a
 * `cached` figure (cache reads + writes) is inserted between them. Before
 * prompt caching is active the `cached` segment is omitted, so it reads as
 * `"12,450 in · 3,210 out"`; once caching kicks in the input number drops and
 * `"… · 11,300 cached · …"` appears — the visible reduction.
 *
 * Returns `null` when there's no usage to show (a fresh session, or a provider
 * that doesn't report billed usage), so the caller can hide the stat entirely.
 */
export function formatUsage(usage: ChatUsage | undefined): string | null {
  if (!usage) return null
  const cached = usage.cacheReadTokens + usage.cacheWriteTokens
  const parts = [`${usage.inputTokens.toLocaleString()} in`]
  if (cached > 0) parts.push(`${cached.toLocaleString()} cached`)
  parts.push(`${usage.outputTokens.toLocaleString()} out`)
  return parts.join(' · ')
}

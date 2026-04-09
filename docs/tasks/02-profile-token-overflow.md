# 02 — Profile Generation Token Overflow

## Problem

Both profile generation functions send unbounded entry data to the AI model. At scale (e.g., 1,825 entries for 5 years of daily journaling), the input exceeds the model's context window and the API call fails outright.

### `generateProfileFromEntries` (`src/services/entryProcessor.ts:75-115`)

Concatenates every indexed entry's summary into one string:
```typescript
const indexed = entries.filter((e) => e.indexed && e.summary)
const entrySummaries = indexed
  .map((e) => `[${e.createdAt.slice(0, 10)}] ${e.title}: ${e.summary} (mood: ${e.mood?.value ?? 'n/a'}/10, tags: ${e.tags.join(', ')})`)
  .join('\n')
```
At 1,825 entries × ~120 chars each ≈ 220K chars ≈ **55K tokens**. Haiku's context window is ~200K tokens so this specific function has room, but the output quality degrades severely when the input is too long for meaningful synthesis.

### `generateFullProfile` (`src/services/entryProcessor.ts:119-196`)

Sends **full entry content** for every indexed entry:
```typescript
const entryContent = indexed
  .sort(...)
  .map((e) => {
    return `--- Entry: ${date} | "${e.title}" | Mood: ${mood} | Tags: ${tags} ---\n${e.content}`
  })
  .join('\n\n')
```
At 1,825 entries × ~1.5KB each ≈ 2.7MB ≈ **675K tokens**. This will exceed any model's context window and fail.

The `max_tokens` parameter (set to `4000` and `8000` respectively) only limits output — it does **not** limit input.

## Desired Behaviour

- Profile generation works reliably regardless of entry count
- Quality improves with more data (not degrades or crashes)
- The user sees clear progress indication during multi-step generation
- Token usage stays within safe bounds (~80% of model context window max)

## Implementation: Hierarchical Summarisation Strategy

### For `generateProfileFromEntries` (Haiku summary profile)

1. **Cap direct input at 200 entries**. If there are more:
   - Split entries into time windows (e.g., 90-day chunks)
   - For each chunk, send summaries to Haiku and get a **period summary** (a paragraph describing that time period's themes, mood trajectory, and key events)
   - Collect all period summaries and send them as input to the final profile generation call
   - This is a "map-reduce" pattern: summarise chunks → synthesise summaries

2. **Implementation sketch**:
   ```typescript
   const MAX_DIRECT_ENTRIES = 200
   
   if (indexed.length <= MAX_DIRECT_ENTRIES) {
     // Current behaviour — send all summaries directly
   } else {
     // Chunk into ~90-day windows
     const chunks = chunkEntriesByTimePeriod(indexed, 90)
     const periodSummaries: string[] = []
     
     for (const chunk of chunks) {
       const chunkSummaries = chunk.map(formatEntrySummary).join('\n')
       const periodSummary = await sendMessage(apiKey, HAIKU_MODEL, 
         PERIOD_SUMMARY_PROMPT, 
         [{ role: 'user', content: chunkSummaries }],
         1000, signal)
       periodSummaries.push(periodSummary)
     }
     
     // Final synthesis from period summaries
     const response = await sendMessage(apiKey, HAIKU_MODEL,
       PROFILE_FROM_PERIODS_PROMPT,
       [{ role: 'user', content: periodSummaries.join('\n\n') }],
       4000, signal)
   }
   ```

3. **Update progress reporting** — the profile store (`src/stores/profileStore.ts:52`) currently shows "Step 3/5". Update to show chunk progress: "Step 3/5 — Summarising period 2 of 8..."

### For `generateFullProfile` (Opus deep profile)

1. **Cap at the most recent 100 entries** (full content) + **include period summaries** for older entries
2. This gives Opus deep access to recent writing while still having historical context via summaries
3. **Implementation sketch**:
   ```typescript
   const FULL_CONTENT_LIMIT = 100
   const recent = indexed.slice(0, FULL_CONTENT_LIMIT)
   const older = indexed.slice(FULL_CONTENT_LIMIT)
   
   let historicalContext = ''
   if (older.length > 0) {
     // Reuse period summaries from the Haiku step if available
     historicalContext = `\n\n## Historical Context (${older.length} earlier entries, summarised)\n${periodSummaries.join('\n\n')}`
   }
   
   const entryContent = recent.map(formatFullEntry).join('\n\n')
   const fullInput = historicalContext + '\n\n## Recent Entries (full text)\n' + entryContent
   ```

### Helper function to add

```typescript
function chunkEntriesByTimePeriod(entries: JournalEntry[], daysPerChunk: number): JournalEntry[][] {
  const sorted = [...entries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const chunks: JournalEntry[][] = []
  let currentChunk: JournalEntry[] = []
  let chunkStart: Date | null = null
  
  for (const entry of sorted) {
    const entryDate = new Date(entry.createdAt)
    if (!chunkStart || (entryDate.getTime() - chunkStart.getTime()) > daysPerChunk * 86400000) {
      if (currentChunk.length > 0) chunks.push(currentChunk)
      currentChunk = [entry]
      chunkStart = entryDate
    } else {
      currentChunk.push(entry)
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk)
  return chunks
}
```

## Files to Modify

- **Modify**: `src/services/entryProcessor.ts` — add chunking logic to `generateProfileFromEntries` and `generateFullProfile`, add helper functions and new prompt constants
- **Modify**: `src/stores/profileStore.ts` — update progress reporting for multi-step generation (lines 86-99)

## Dependencies

None — pure logic changes.

## Testing Notes

- Test with < 200 entries — should behave identically to current code
- Test with > 200 entries — should chunk, summarise, and synthesise without API errors
- Verify that the final profile quality is comparable (period summaries capture the key information)
- Monitor token usage in console logs to confirm inputs stay within bounds
- Test abort/cancel during multi-chunk summarisation — should respect the `signal` parameter
- Verify progress UI updates correctly during each sub-step

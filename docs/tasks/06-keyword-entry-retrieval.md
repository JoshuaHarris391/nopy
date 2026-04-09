# 06 — Keyword-Based Entry Retrieval for Context Assembly

## Problem

The context assembler injects the 30 most recent entries into the system prompt, regardless of what the user is actually talking about. If the user references something from 6 months ago ("I'm feeling the same way I did after that argument with my dad"), that entry is invisible to the model because it's beyond the recency window.

## Current Behaviour

`src/services/contextAssembler.ts:48-67`:
```typescript
const indexed = entries.filter((e) => e.indexed && e.summary)

if (indexed.length > 0) {
  const sortedEntries = indexed
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, JOURNAL_INDEX_LIMIT)  // JOURNAL_INDEX_LIMIT = 30
  // ... format as markdown table and inject
}
```

Pure recency — no relevance signal from the user's current message or conversation.

## Desired Behaviour

- The 30-entry index slot is split: **10 most recent** (temporal context) + **up to 20 relevance-scored** (semantic context)
- Relevance is scored using the existing structured metadata: `tags`, `summary`, `title`, `mood`, and `emotionalValence`
- Scoring uses the user's **latest message** + the **entry context title** (if present) as the query
- No embedding API needed — this is keyword/tag matching over existing data
- Falls back to pure recency if no relevant entries are found

## Implementation Steps

### 1. Create a scoring function

Create `src/services/entryRetrieval.ts`:

```typescript
import type { JournalEntry } from '../types/journal'

interface ScoredEntry {
  entry: JournalEntry
  score: number
}

/**
 * Score entries by relevance to a query string.
 * Uses keyword matching against tags, summary, and title.
 * No embeddings — works with existing structured metadata.
 */
export function scoreEntriesByRelevance(
  entries: JournalEntry[],
  query: string,
  limit: number = 20,
): ScoredEntry[] {
  if (!query.trim()) return []
  
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []
  
  const scored: ScoredEntry[] = entries
    .filter((e) => e.indexed && e.summary)
    .map((entry) => {
      let score = 0
      
      // Tag matches (highest weight — structured, reliable)
      for (const tag of entry.tags) {
        const tagTokens = tokenize(tag)
        for (const qt of queryTokens) {
          if (tagTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) {
            score += 3
          }
        }
      }
      
      // Title matches
      const titleTokens = tokenize(entry.title)
      for (const qt of queryTokens) {
        if (titleTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) {
          score += 2
        }
      }
      
      // Summary matches (broad but useful)
      const summaryTokens = tokenize(entry.summary || '')
      for (const qt of queryTokens) {
        if (summaryTokens.some((st) => st.includes(qt) || qt.includes(st))) {
          score += 1
        }
      }
      
      return { entry, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  
  return scored
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)  // skip tiny words
}
```

### 2. Update `src/services/contextAssembler.ts`

Modify the `assembleContext` function to accept the user's latest message and use it for retrieval:

```typescript
// Add parameter
export function assembleContext(
  session: ChatSession,
  profile: PsychologicalProfile | null,
  entries: JournalEntry[],
  systemPrompt: string,
  contextBudget: number = 30000,
  entryContext?: ChatEntryContext,
): AssembledContext {
```

Replace the entry index section (lines 48-67):

```typescript
const indexed = entries.filter((e) => e.indexed && e.summary)

if (indexed.length > 0) {
  // Get user's latest message as the retrieval query
  const lastUserMsg = [...session.messages].reverse().find((m) => m.role === 'user')
  const query = [
    lastUserMsg?.content || '',
    entryContext?.title || '',
  ].join(' ')
  
  // Split budget: 10 most recent + up to 20 relevant
  const RECENT_LIMIT = 10
  const RELEVANT_LIMIT = 20
  
  const recentEntries = indexed
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_LIMIT)
  
  const recentIds = new Set(recentEntries.map((e) => e.id))
  const relevantCandidates = indexed.filter((e) => !recentIds.has(e.id))
  const relevantEntries = scoreEntriesByRelevance(relevantCandidates, query, RELEVANT_LIMIT)
    .map((s) => s.entry)
  
  const allEntries = [...recentEntries, ...relevantEntries]
  
  // Format and inject (same table format as before)
  const table = allEntries
    .map((e) => {
      const date = e.createdAt.slice(0, 10)
      const mood = e.mood ? `${e.mood.value}/10` : '-'
      const tags = e.tags.join(', ') || '-'
      return `| ${date} | ${e.title} | ${mood} | ${tags} | ${e.summary} |`
    })
    .join('\n')
  
  const recentLabel = `${recentEntries.length} recent`
  const relevantLabel = relevantEntries.length > 0 ? ` + ${relevantEntries.length} relevant` : ''
  system += `\n\n## Journal Entry Index (${recentLabel}${relevantLabel})\n| Date | Title | Mood | Tags | Summary |\n|------|-------|------|------|---------|${table ? '\n' + table : ''}`
}
```

### 3. Update call sites

Find where `assembleContext` is called (likely in a chat service or component). No signature change is needed since we extract the query from `session.messages` inside the function.

## Files to Modify

- **New**: `src/services/entryRetrieval.ts` — scoring function
- **Modify**: `src/services/contextAssembler.ts` — replace pure-recency index with split recency + relevance (lines 48-67)

## Dependencies

None.

## Testing Notes

- Start a chat and mention a specific topic (e.g., "work stress"). Verify that older entries tagged with "work stress" appear in the context (check console logs from contextAssembler).
- Verify the 10 most recent entries are always present regardless of query.
- Test with no user messages yet (first message in a new session) — should fall back to pure recency.
- Test with an entry context (session focused on a specific journal entry) — relevant entries should be scored against that entry's title.
- Verify the total entry count in the index doesn't exceed 30 (10 recent + 20 relevant max).
- Check that no entry appears twice (the `recentIds` deduplication should work).
- Test with a query that has no keyword matches — should still get 10 recent entries.

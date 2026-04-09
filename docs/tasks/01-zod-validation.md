# 01 — Zod Validation at AI Response Boundary

## Problem

AI model responses (Haiku) are parsed with `JSON.parse()` and either cast directly or checked with loose truthy guards. If the model returns malformed data — wrong types, out-of-range values, extra fields, or structural drift — it silently propagates into IndexedDB and gets written to the user's markdown files via `saveEntryToDisk`. The source of truth (markdown frontmatter) becomes corrupted with no way to detect or recover.

## Current Behaviour

### Entry metadata parsing (`src/services/entryProcessor.ts:34-46`)

```typescript
const parsed = JSON.parse(cleaned) as EntryMetadata
if (!parsed.mood?.value || !parsed.mood?.label || !parsed.tags || !parsed.summary) {
  throw new Error('Invalid response structure')
}
return parsed
```

Problems:
- `as EntryMetadata` is a compile-time cast — no runtime guarantee
- `mood.value` could be `"excellent"` (string) instead of `8` (number) and pass the truthy check
- `tags` could be `"work"` (string) instead of `["work"]` (array) and pass the truthy check
- `emotionalValence` is not validated at all — any string is accepted
- No range validation: `mood.value` could be `99` or `-3`

### Profile response parsing (`src/services/entryProcessor.ts:108-114`)

```typescript
const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
return JSON.parse(cleaned)
```

Zero validation. Whatever the model returns becomes the profile.

### Frontmatter parsing on disk load (`src/services/fs.ts:190-203`)

```typescript
mood: (frontmatter.mood as JournalEntry['mood']) || null,
tags: (frontmatter.tags as string[]) || [],
indexed: (frontmatter.indexed as boolean) || false,
```

Raw `as` casts on data read from disk. If the file was corrupted (by a previous bad write), the corrupt data enters the app unchecked.

## Desired Behaviour

- All AI responses are validated through Zod schemas before being used
- Invalid fields are coerced where safe (e.g., clamp mood.value to 1-10, wrap a bare string tag in an array)
- Structurally invalid responses throw descriptive errors that include which field failed
- Frontmatter parsed from disk is validated through the same schemas
- No `as` type assertions on untrusted data

## Implementation Steps

1. **Install Zod**
   ```bash
   npm install zod
   ```

2. **Create `src/schemas/journal.ts`** with these schemas:

   ```typescript
   import { z } from 'zod'

   export const MoodLabelSchema = z.enum(['low', 'mixed', 'neutral', 'good', 'great'])

   export const MoodScoreSchema = z.object({
     value: z.number().int().min(1).max(10),
     label: MoodLabelSchema,
   })

   export const EmotionalValenceSchema = z.enum([
     'Positive', 'Mostly Positive', 'Mixed', 'Mostly Negative', 'Negative',
   ])

   export const EntryMetadataSchema = z.object({
     mood: MoodScoreSchema,
     tags: z.array(z.string()).min(1).max(10),
     summary: z.string().min(1),
     emotionalValence: EmotionalValenceSchema,
   })

   // Coercive version for parsing AI output — tries to fix common issues
   export const EntryMetadataCoercedSchema = z.object({
     mood: z.object({
       value: z.coerce.number().int().min(1).max(10).catch(5),
       label: MoodLabelSchema.catch('neutral'),
     }),
     tags: z.union([
       z.array(z.string()),
       z.string().transform((s) => [s]),  // wrap bare string
     ]).pipe(z.array(z.string()).min(1).max(10)),
     summary: z.string().min(1),
     emotionalValence: EmotionalValenceSchema.catch('Mixed'),
   })
   ```

3. **Create `src/schemas/profile.ts`** with schemas for the profile response:

   ```typescript
   import { z } from 'zod'

   export const ThemeInsightSchema = z.object({
     theme: z.string(),
     frequency: z.number().min(1).max(10),
     description: z.string(),
   })

   export const CognitivePatternSchema = z.object({
     pattern: z.string(),
     framework: z.enum(['CBT', 'ACT', 'DBT', 'MI']).catch('CBT'),
     description: z.string(),
     frequency: z.number().min(1).max(10),
   })

   export const ProfileResponseSchema = z.object({
     summary: z.string().min(1),
     themes: z.array(ThemeInsightSchema).min(1),
     cognitivePatterns: z.array(CognitivePatternSchema),
     strengths: z.array(z.string()),
     growthAreas: z.array(z.string()),
     frameworkInsights: z.array(z.string()),
     emotionalTrends: z.array(z.string()),
   })
   ```

4. **Update `src/services/entryProcessor.ts`**
   - Import `EntryMetadataCoercedSchema` 
   - In `processEntry()` (line 37): replace `JSON.parse(cleaned) as EntryMetadata` with `EntryMetadataCoercedSchema.parse(JSON.parse(cleaned))`
   - Remove the manual truthy checks (lines 39-41)
   - In `generateProfileFromEntries()` (line 110): replace `JSON.parse(cleaned)` with `ProfileResponseSchema.parse(JSON.parse(cleaned))`

5. **Create `src/schemas/frontmatter.ts`** — a schema for validating entries loaded from disk:

   ```typescript
   export const FrontmatterEntrySchema = z.object({
     id: z.string().uuid().optional(),
     title: z.string().optional(),
     createdAt: z.string().datetime().optional(),
     updatedAt: z.string().datetime().optional(),
     mood: MoodScoreSchema.nullable().optional(),
     tags: z.array(z.string()).optional().default([]),
     summary: z.string().nullable().optional(),
     indexed: z.boolean().optional().default(false),
     emotionalValence: EmotionalValenceSchema.optional(),
   })
   ```

6. **Update `src/services/fs.ts`**
   - In `loadEntriesFromDisk()` (lines 190-203): validate `frontmatter` through `FrontmatterEntrySchema.safeParse()`. On failure, log a warning and treat the entry as unindexed (preserving content but discarding bad metadata).
   - Remove all `as` casts on frontmatter fields.

## Files to Modify

- **New**: `src/schemas/journal.ts`, `src/schemas/profile.ts`, `src/schemas/frontmatter.ts`
- **Modify**: `src/services/entryProcessor.ts` (lines 34-46, 108-114)
- **Modify**: `src/services/fs.ts` (lines 190-203)
- **Modify**: `package.json` (add `zod` dependency)

## Dependencies

- `zod` (npm package, latest version)

## Testing Notes

- Test with valid AI responses — should pass through unchanged
- Test with a mood value of `11` — should clamp to `10`
- Test with `tags: "single-tag"` — should coerce to `["single-tag"]`
- Test with `emotionalValence: "Amazing"` — should fall back to `"Mixed"`
- Test with completely invalid JSON — should throw a descriptive Zod error
- Test loading a markdown file with corrupted frontmatter — should load as unindexed with content preserved
- Verify existing entries are still loaded correctly after the change

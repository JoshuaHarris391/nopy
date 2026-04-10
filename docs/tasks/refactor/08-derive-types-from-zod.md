# 08 — Derive TypeScript Types from Zod Schemas

## Problem

The codebase maintains hand-written TypeScript interfaces alongside Zod schemas that describe the same shapes. The two have already drifted:

- `src/types/profile.ts:14-29` defines `PsychologicalProfile` with fields (`averageMood`, `fullProfile`, `updatedAt`, `entriesAnalysed`, `avgEntryLength`, `reflectionDepth`, `journalingStreak`) that do not exist in `ProfileResponseSchema` (`src/schemas/profile.ts`). The schema only covers the AI response shape; the full profile type extends it with local stats and generated text.
- `src/services/entryProcessor.ts:80` returns `Omit<PsychologicalProfile, 'averageMood' | 'fullProfile' | 'updatedAt' | 'entriesAnalysed' | 'avgEntryLength' | 'reflectionDepth' | 'journalingStreak'>` — a literal list of 7 fields that must be kept in sync manually. Adding a field to `PsychologicalProfile` without updating this `Omit` silently changes the return type.
- `MoodScore` is defined in both `src/types/journal.ts:3` and `src/schemas/journal.ts:5` (as `MoodScoreSchema`). They agree today, but there is no compile-time guarantee they will tomorrow.

When types and schemas drift, bugs are invisible until runtime: a field added to the Zod schema but not the interface won't error at compile time, but the runtime object will have a property that TypeScript doesn't know about.

## Current Behaviour

### `types/profile.ts:14-29`

```typescript
export interface PsychologicalProfile {
  summary: string
  themes: ThemeInsight[]
  cognitivePatterns: CognitivePattern[]
  strengths: string[]
  growthAreas: string[]
  emotionalTrends: string[]
  averageMood: number | null
  fullProfile: string | null
  updatedAt: string
  entriesAnalysed: number
  avgEntryLength: number
  reflectionDepth: string
  journalingStreak: number
}
```

### `schemas/profile.ts` — `ProfileResponseSchema`

```typescript
export const ProfileResponseSchema = z.object({
  summary: z.string().min(1),
  themes: z.array(ThemeInsightSchema).min(1),
  cognitivePatterns: z.array(CognitivePatternSchema),
  strengths: z.array(z.string().min(1)),
  growthAreas: z.array(z.string().min(1)),
  emotionalTrends: z.array(z.string().min(1)),
})
```

The schema covers 6 fields; the interface has 13. The 7 extra fields come from `computeLocalStats` and `generateFullProfile`.

### `types/journal.ts:3` and `schemas/journal.ts:5` — `MoodScore`

```typescript
// types/journal.ts
export type MoodScore = { value: number; label: MoodLabel }

// schemas/journal.ts
export const MoodScoreSchema = z.object({
  value: z.number().int().min(1).max(10),
  label: z.enum([...]),
})
```

These agree on shape but the schema adds constraints (int, min, max, enum) that the type does not express. The type should be derived from the schema so it inherits the constraints at documentation level.

## Desired Behaviour

- Every TypeScript type that has a Zod equivalent is derived via `z.infer<typeof Schema>`.
- Hand-written interfaces are deleted.
- For types that extend a schema's shape with additional fields (like `PsychologicalProfile`), the schema is extended or a new schema is created — the type is still derived from Zod.
- `Omit<>` lists referencing field names disappear — replaced by proper schema composition.

## Implementation Steps

### 1. Derive `MoodScore` from `MoodScoreSchema`

In `src/types/journal.ts`, replace:

```typescript
export type MoodScore = { value: number; label: MoodLabel }
```

With:

```typescript
import { MoodScoreSchema } from '../schemas/journal'
export type MoodScore = z.infer<typeof MoodScoreSchema>
```

Delete the `MoodLabel` type definition if it is also derivable from the schema's enum.

### 2. Create `PsychologicalProfileSchema`

In `src/schemas/profile.ts`, extend `ProfileResponseSchema`:

```typescript
export const LocalStatsSchema = z.object({
  averageMood: z.number().nullable(),
  avgEntryLength: z.number(),
  reflectionDepth: z.string(),
  journalingStreak: z.number(),
})

export const PsychologicalProfileSchema = ProfileResponseSchema.extend({
  ...LocalStatsSchema.shape,
  entriesAnalysed: z.number(),
  updatedAt: z.string(),
  fullProfile: z.string().nullable(),
})
```

### 3. Derive `PsychologicalProfile` type

In `src/types/profile.ts`:

```typescript
import { PsychologicalProfileSchema } from '../schemas/profile'
export type PsychologicalProfile = z.infer<typeof PsychologicalProfileSchema>
```

Delete the hand-written interface.

### 4. Fix `entryProcessor.ts` return type

Replace:

```typescript
Omit<PsychologicalProfile, 'averageMood' | 'fullProfile' | 'updatedAt' | 'entriesAnalysed' | 'avgEntryLength' | 'reflectionDepth' | 'journalingStreak'>
```

With:

```typescript
z.infer<typeof ProfileResponseSchema>
```

Since `ProfileResponseSchema` is exactly the AI-response subset.

### 5. Audit remaining types

Check `src/types/chat.ts` and `src/types/settings.ts` for any other hand-written types that should be schema-derived. If they have no corresponding Zod schema, leave them as-is — schemas are only valuable at trust boundaries.

## Files to Modify

- **Modify**: `src/types/profile.ts` — replace interface with `z.infer`.
- **Modify**: `src/types/journal.ts` — derive `MoodScore` and `MoodLabel` from schemas.
- **Modify**: `src/schemas/profile.ts` — add `LocalStatsSchema` and `PsychologicalProfileSchema`.
- **Modify**: `src/schemas/journal.ts` — export `MoodLabel` enum values if needed for derivation.
- **Modify**: `src/services/entryProcessor.ts` — replace `Omit<...>` with `z.infer<typeof ProfileResponseSchema>`.
- **Modify**: any consumers that import the deleted types (compiler will find them).

## Dependencies

None.

## Testing Notes

### Compilation-based verification

`tsc -b` is the primary test. If a type and its schema have drifted, the compiler will fail loudly on every consumer that accesses a field that doesn't exist in the schema — that's the intended outcome.

### Existing tests

All existing schema tests in `src/__tests__/schemas/profile.test.ts` and `src/__tests__/schemas/journal.test.ts` must continue to pass. The tests validate parsing behavior, which doesn't change — we are only changing how the TypeScript type is derived from the schema.

### Manual

1. `npm run build` — must complete with no type errors.
2. `npm test` — must pass.
3. Review `ProfileView.tsx`, `MoodTimeline.tsx`, `entryProcessor.ts`, and `profileStore.ts` for any red squiggles in your IDE.

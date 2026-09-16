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

export const LocalStatsSchema = z.object({
  averageMood: z.number(),
  avgEntryLength: z.number(),
  reflectionDepth: z.enum(['Low', 'Medium', 'High']),
  journalingStreak: z.number(),
})

/** Which index records feed a generation. */
export const ProfileScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('entries'), count: z.number().int().min(1) }),
  z.object({ kind: z.literal('months'), count: z.number().int().min(1) }),
])

export const PsychologicalProfileSchema = ProfileResponseSchema.extend({
  /**
   * Version identity. Every generation is kept; the id names its history
   * files and IndexedDB key. Optional so profiles saved before versioning
   * still parse; they are assigned an id on load.
   */
  id: z.string().optional(),
  createdAt: z.string().optional(),
  scope: ProfileScopeSchema.optional(),
  /** Id of the version an incremental revision built on. */
  basedOn: z.string().nullable().optional(),
  isRevision: z.boolean().optional(),
  ...LocalStatsSchema.shape,
  entriesAnalyzed: z.number(),
  updatedAt: z.string(),
  fullProfile: z.string().nullable(),
  /**
   * Ids of the entries whose index records the current `fullProfile` has
   * seen. Incremental generation sends only records outside this set. Ids,
   * not a timestamp: entries can be backdated. Defaults keep an older
   * profile.json parseable.
   */
  analyzedEntryIds: z.array(z.string()).optional(),
  /** Index schema version the records had when `fullProfile` was written. */
  indexVersionUsed: z.number().int().optional(),
})

import { z } from 'zod'

export const MoodLabelSchema = z.enum(['low', 'mixed', 'neutral', 'good', 'great'])

export const MoodScoreSchema = z.object({
  value: z.number().int().min(1).max(10),
  label: MoodLabelSchema,
})

export const EntryMetadataSchema = z.object({
  mood: MoodScoreSchema,
  tags: z.array(z.string()).min(1).max(10),
  summary: z.string().min(1),
})

// Coercive version for parsing AI output — tries to fix common issues
export const EntryMetadataCoercedSchema = z.object({
  mood: z.object({
    value: z.coerce.number().int().min(1).max(10).catch(5),
    label: MoodLabelSchema.catch('neutral'),
  }),
  tags: z.union([
    z.array(z.string()),
    z.string().transform((s) => [s]),
  ]).pipe(z.array(z.string()).min(1).max(10)),
  summary: z.string().min(1),
})

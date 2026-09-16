import { z } from 'zod'
import { MoodScoreSchema, EntryInsightSchema } from './journal'

export const FrontmatterEntrySchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  mood: MoodScoreSchema.nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  summary: z.string().nullable().optional(),
  indexed: z.boolean().optional().default(false),
  /**
   * Structured index record. Validated strictly: a record that no longer
   * matches the schema is dropped (entry stays indexed with its summary) so
   * a schema change can never make an entry unloadable.
   */
  insight: EntryInsightSchema.nullable().optional().catch(null),
  indexVersion: z.number().int().optional(),
  indexModel: z.string().nullable().optional(),
})

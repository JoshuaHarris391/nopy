import { z } from 'zod'
import { MoodScoreSchema } from './journal'

export const FrontmatterEntrySchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  mood: MoodScoreSchema.nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  summary: z.string().nullable().optional(),
  indexed: z.boolean().optional().default(false),
})

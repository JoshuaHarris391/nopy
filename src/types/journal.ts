import type { z } from 'zod'
import type { MoodLabelSchema, MoodScoreSchema } from '../schemas/journal'

export type MoodLabel = z.infer<typeof MoodLabelSchema>
export type MoodScore = z.infer<typeof MoodScoreSchema>

export interface JournalEntry {
  id: string
  title: string
  content: string // raw markdown
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
  mood: MoodScore | null
  tags: string[]
  summary: string | null
  indexed: boolean
  sourceFilename?: string // original filename on disk, used for overwriting/deleting
}

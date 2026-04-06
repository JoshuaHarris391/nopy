export type MoodLabel = 'low' | 'mixed' | 'neutral' | 'good' | 'great'

export interface MoodScore {
  value: number // 1-10
  label: MoodLabel
}

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
  emotionalValence?: string // "Positive" | "Mostly Positive" | "Mixed" | "Mostly Negative" | "Negative"
}

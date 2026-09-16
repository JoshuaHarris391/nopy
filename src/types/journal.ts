import type { z } from 'zod'
import type {
  MoodLabelSchema, MoodScoreSchema, EntryInsightSchema, InferredStateSchema,
  PersonMentionSchema, QuoteSchema, FocalEventSchema, ObservationSchema,
  DomainSchema, EmotionLabelSchema, InteractionSchema, FeltAfterSchema,
  CopingStrategySchema, QuoteCategorySchema, SafetyFlagSchema, ObservationKindSchema,
  StateKeySchema,
} from '../schemas/journal'

export type MoodLabel = z.infer<typeof MoodLabelSchema>
export type MoodScore = z.infer<typeof MoodScoreSchema>

export type StateKey = z.infer<typeof StateKeySchema>
export type InferredState = z.infer<typeof InferredStateSchema>
export type PersonMention = z.infer<typeof PersonMentionSchema>
export type EntryQuote = z.infer<typeof QuoteSchema>
export type FocalEvent = z.infer<typeof FocalEventSchema>
export type Observation = z.infer<typeof ObservationSchema>
export type Domain = z.infer<typeof DomainSchema>
export type EmotionLabel = z.infer<typeof EmotionLabelSchema>
export type Interaction = z.infer<typeof InteractionSchema>
export type FeltAfter = z.infer<typeof FeltAfterSchema>
export type CopingStrategy = z.infer<typeof CopingStrategySchema>
export type QuoteCategory = z.infer<typeof QuoteCategorySchema>
export type SafetyFlag = z.infer<typeof SafetyFlagSchema>
export type ObservationKind = z.infer<typeof ObservationKindSchema>

/** The structured, machine-readable record the v2 index stores per entry. */
export type EntryInsight = z.infer<typeof EntryInsightSchema>

export interface JournalEntry {
  id: string
  title: string
  content: string // raw markdown
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
  mood: MoodScore | null
  /** Closed domain values for v2-indexed entries; free-form tags on legacy ones. */
  tags: string[]
  summary: string | null
  indexed: boolean
  /**
   * Structured index record (v2+). Absent/null on entries indexed before the
   * structured index existed and on entries never indexed.
   */
  insight?: EntryInsight | null
  /**
   * Which index schema/prompt produced this entry's metadata. Absent on
   * entries persisted before versioning; read it through `getIndexVersion`
   * (0 = never indexed, 1 = legacy summary-only, 2 = structured).
   */
  indexVersion?: number
  /** Model id that produced the index, for provenance. */
  indexModel?: string | null
  sourceFilename?: string // original filename on disk, used for overwriting/deleting
}

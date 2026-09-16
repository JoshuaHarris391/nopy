import type { z } from 'zod'
import type { ThemeInsightSchema, CognitivePatternSchema, PsychologicalProfileSchema, ProfileScopeSchema } from '../schemas/profile'

export type ThemeInsight = z.infer<typeof ThemeInsightSchema>
export type CognitivePattern = z.infer<typeof CognitivePatternSchema>
export type PsychologicalProfile = z.infer<typeof PsychologicalProfileSchema>

/** Which index records feed a generation: everything, the newest N, or the last N months. */
export type ProfileScope = z.infer<typeof ProfileScopeSchema>

/** Light record of one generated profile, listed in the Profile page's history. */
export interface ProfileVersionMeta {
  id: string
  createdAt: string
  entriesAnalyzed: number
  scope: ProfileScope
  isRevision: boolean
  basedOn: string | null
  hasFullProfile: boolean
  indexVersionUsed: number | null
}

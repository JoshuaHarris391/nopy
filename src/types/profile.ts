import type { z } from 'zod'
import type { ThemeInsightSchema, CognitivePatternSchema, PsychologicalProfileSchema } from '../schemas/profile'

export type ThemeInsight = z.infer<typeof ThemeInsightSchema>
export type CognitivePattern = z.infer<typeof CognitivePatternSchema>
export type PsychologicalProfile = z.infer<typeof PsychologicalProfileSchema>

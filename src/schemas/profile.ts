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

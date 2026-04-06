export interface ThemeInsight {
  theme: string
  frequency: number
  description: string
}

export interface CognitivePattern {
  pattern: string
  framework: 'CBT' | 'ACT' | 'DBT' | 'MI'
  description: string
  frequency: number
}

export interface PsychologicalProfile {
  summary: string
  themes: ThemeInsight[]
  cognitivePatterns: CognitivePattern[]
  emotionalTrends: string[]
  growthAreas: string[]
  strengths: string[]
  frameworkInsights: string[]
  updatedAt: string
  entriesAnalysed: number
}

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
  averageMood: number
  journalingStreak: number
  avgEntryLength: number
  reflectionDepth: 'Low' | 'Medium' | 'High'
  emotionalDistribution: { label: string; percentage: number; color: string }[]
  updatedAt: string
  entriesAnalysed: number
}

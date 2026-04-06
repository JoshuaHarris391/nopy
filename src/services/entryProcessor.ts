import { sendMessage } from './anthropic'
import type { JournalEntry, MoodLabel } from '../types/journal'
import type { PsychologicalProfile } from '../types/profile'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

interface EntryMetadata {
  mood: { value: number; label: MoodLabel }
  tags: string[]
  summary: string
  emotionalValence: string
}

export async function processEntry(entry: JournalEntry, apiKey: string): Promise<EntryMetadata> {
  const response = await sendMessage(
    apiKey,
    HAIKU_MODEL,
    `You are a clinical psychologist analysing journal entries. Your tone balances emotional attunement with clinical precision — you notice what matters to the person, name the people and specific moments they describe, and frame observations using accurate psychological language without being cold or detached.

Analyse this journal entry and return structured metadata as JSON.

Return ONLY valid JSON with these fields:
- mood: { value (integer 1-10 where 1=very low, 10=excellent), label (one of: "low", "mixed", "neutral", "good", "great") }
- tags: array of 3-6 short theme tags (lowercase, e.g. "work stress", "gratitude", "relationships")
- summary: 1-2 sentence clinical summary that references specific people and events from the entry by name, identifies the core emotional state, and notes any relevant psychological patterns (e.g. cognitive distortions, avoidance, values-driven behaviour)
- emotionalValence: one of "Positive", "Mostly Positive", "Mixed", "Mostly Negative", "Negative"

No markdown, no explanation, just the JSON object.`,
    [{ role: 'user', content: `Title: ${entry.title}\n\n${entry.content}` }],
    500,
  )

  try {
    // Strip any markdown code fences if present
    const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned) as EntryMetadata
    // Validate
    if (!parsed.mood?.value || !parsed.mood?.label || !parsed.tags || !parsed.summary) {
      throw new Error('Invalid response structure')
    }
    return parsed
  } catch (e) {
    console.error('[processor] Failed to parse Haiku response:', response, e)
    throw new Error(`Failed to parse entry metadata: ${e}`)
  }
}

export async function processAllEntries(
  entries: JournalEntry[],
  apiKey: string,
  force: boolean,
  onProgress: (current: number, total: number, entryTitle: string) => void,
): Promise<Map<string, EntryMetadata>> {
  const toProcess = force ? entries : entries.filter((e) => !e.indexed)
  const results = new Map<string, EntryMetadata>()

  for (let i = 0; i < toProcess.length; i++) {
    const entry = toProcess[i]
    onProgress(i + 1, toProcess.length, entry.title)
    try {
      const metadata = await processEntry(entry, apiKey)
      results.set(entry.id, metadata)
    } catch (e) {
      console.error(`[processor] Failed to process entry "${entry.title}":`, e)
      // Continue with other entries
    }
  }

  return results
}

export async function generateProfileFromEntries(
  entries: JournalEntry[],
  apiKey: string,
): Promise<Omit<PsychologicalProfile, 'averageMood' | 'journalingStreak' | 'avgEntryLength' | 'reflectionDepth' | 'emotionalDistribution' | 'updatedAt' | 'entriesAnalysed'>> {
  // Build context from all indexed entries
  const indexed = entries.filter((e) => e.indexed && e.summary)
  const entrySummaries = indexed
    .map((e) => `[${e.createdAt.slice(0, 10)}] ${e.title}: ${e.summary} (mood: ${e.mood?.value ?? 'n/a'}/10, tags: ${e.tags.join(', ')})`)
    .join('\n')

  const response = await sendMessage(
    apiKey,
    HAIKU_MODEL,
    `You are a clinical psychologist writing a psychological profile based on journal entry summaries. Balance emotional attunement with clinical rigour — name the person's specific experiences, relationships, and struggles by name where they appear, and frame your observations using accurate psychological frameworks (CBT, ACT) without being cold or reductive.

Write as though you are preparing notes for a supervision session — clinically precise, but with genuine care for the person behind the data.

Return ONLY valid JSON with:
- summary: A 3-4 sentence paragraph synthesising the person's psychological state, naming specific people, relationships, and events that recur across entries, and identifying the core trajectory of change
- themes: Array of { theme: string, frequency: number (1-10), description: string } for the top 5-8 recurring themes — descriptions should reference specific entries or moments
- cognitivePatterns: Array of { pattern: string, framework: "CBT" | "ACT", description: string, frequency: number (1-10) } for 2-4 observed patterns — cite specific examples from the entries
- strengths: Array of 3-5 strength statements grounded in specific evidence from the entries
- growthAreas: Array of 2-4 growth area statements that are compassionate but clinically honest
- frameworkInsights: Array of 2-3 therapeutic observations linking specific entry content to CBT/ACT concepts
- emotionalTrends: Array of 3-5 short trend descriptions tracking how emotional states have shifted across the timeline

No markdown, just JSON.`,
    [{ role: 'user', content: `Here are ${indexed.length} journal entry summaries:\n\n${entrySummaries}` }],
    2000,
  )

  try {
    const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    return JSON.parse(cleaned)
  } catch (e) {
    console.error('[processor] Failed to parse profile response:', response, e)
    throw new Error(`Failed to generate profile: ${e}`)
  }
}

// Local computation — no API call needed
export function computeLocalStats(entries: JournalEntry[]): {
  averageMood: number
  journalingStreak: number
  avgEntryLength: number
  reflectionDepth: 'Low' | 'Medium' | 'High'
  emotionalDistribution: { label: string; percentage: number; color: string }[]
} {
  const indexed = entries.filter((e) => e.indexed)
  if (indexed.length === 0) {
    return {
      averageMood: 0,
      journalingStreak: 0,
      avgEntryLength: 0,
      reflectionDepth: 'Low',
      emotionalDistribution: [],
    }
  }

  // Average mood
  const moodsWithValues = indexed.filter((e) => e.mood?.value)
  const averageMood = moodsWithValues.length > 0
    ? Math.round((moodsWithValues.reduce((sum, e) => sum + (e.mood?.value ?? 0), 0) / moodsWithValues.length) * 10) / 10
    : 0

  // Journaling streak (consecutive days from most recent)
  const dates = [...new Set(entries.map((e) => e.createdAt.slice(0, 10)))].sort().reverse()
  let journalingStreak = 0
  const today = new Date().toISOString().slice(0, 10)
  let checkDate = today
  for (const date of dates) {
    if (date === checkDate || date === getPreviousDay(checkDate)) {
      journalingStreak++
      checkDate = date
    } else {
      break
    }
  }

  // Average entry length
  const totalWords = entries.reduce((sum, e) => sum + e.content.split(/\s+/).filter(Boolean).length, 0)
  const avgEntryLength = Math.round(totalWords / entries.length)

  // Reflection depth (based on avg entry length)
  const reflectionDepth: 'Low' | 'Medium' | 'High' =
    avgEntryLength >= 300 ? 'High' : avgEntryLength >= 150 ? 'Medium' : 'Low'

  // Emotional distribution from emotionalValence
  const valenceCounts: Record<string, number> = {}
  const valenceColors: Record<string, string> = {
    'Positive': 'var(--gentle-green)',
    'Mostly Positive': 'var(--sage)',
    'Mixed': 'var(--dusk-blue)',
    'Mostly Negative': 'var(--amber)',
    'Negative': 'var(--soft-coral)',
  }
  for (const entry of indexed) {
    const v = entry.emotionalValence || 'Mixed'
    valenceCounts[v] = (valenceCounts[v] || 0) + 1
  }
  const emotionalDistribution = Object.entries(valenceCounts)
    .map(([label, count]) => ({
      label,
      percentage: Math.round((count / indexed.length) * 100),
      color: valenceColors[label] || 'var(--stone)',
    }))
    .sort((a, b) => b.percentage - a.percentage)

  return { averageMood, journalingStreak, avgEntryLength, reflectionDepth, emotionalDistribution }
}

function getPreviousDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

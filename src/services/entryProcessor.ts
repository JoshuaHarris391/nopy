import { sendMessage } from './anthropic'
import type { JournalEntry, MoodLabel } from '../types/journal'
import type { PsychologicalProfile } from '../types/profile'
import { EntryMetadataCoercedSchema } from '../schemas/journal'
import { ProfileResponseSchema } from '../schemas/profile'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

interface EntryMetadata {
  mood: { value: number; label: MoodLabel }
  tags: string[]
  summary: string
}

export async function processEntry(entry: JournalEntry, apiKey: string, signal?: AbortSignal): Promise<EntryMetadata> {
  const response = await sendMessage(
    apiKey,
    HAIKU_MODEL,
    `You are a clinical psychologist analysing journal entries. Your tone balances emotional attunement with clinical precision — you notice what matters to the person, name the people and specific moments they describe, and frame observations using accurate psychological language without being cold or detached.

Analyse this journal entry and return structured metadata as JSON.

Return ONLY valid JSON with these fields:
- mood: { value (integer 1-10 where 1=very low, 10=excellent), label (one of: "low", "mixed", "neutral", "good", "great") }
- tags: array of 3-6 short theme tags (lowercase, e.g. "work stress", "gratitude", "relationships")
- summary: 1-2 sentence clinical summary that references specific people and events from the entry by name, identifies the core emotional state, and notes any relevant psychological patterns (e.g. cognitive distortions, avoidance, values-driven behaviour)

No markdown, no explanation, just the JSON object.`,
    [{ role: 'user', content: `Title: ${entry.title}\n\n${entry.content}` }],
    500,
    signal,
  )

  try {
    // Strip any markdown code fences if present
    const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const parsed = EntryMetadataCoercedSchema.parse(JSON.parse(cleaned))
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
  signal?: AbortSignal,
): Promise<Map<string, EntryMetadata>> {
  const toProcess = force ? entries : entries.filter((e) => !e.indexed)
  const results = new Map<string, EntryMetadata>()

  for (let i = 0; i < toProcess.length; i++) {
    if (signal?.aborted) break
    const entry = toProcess[i]
    onProgress(i + 1, toProcess.length, entry.title)
    try {
      const metadata = await processEntry(entry, apiKey, signal)
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
  signal?: AbortSignal,
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
- summary: 2-3 sentence paragraph naming specific people and the core trajectory of change
- themes: Array of { theme: string, frequency: number (1-10), description: string (1-2 sentences max) } for the top 5-6 recurring themes
- cognitivePatterns: Array of { pattern: string, framework: "CBT" | "ACT", description: string (1-2 sentences max), frequency: number (1-10) } for 2-3 observed patterns
- strengths: Array of 3-4 short strength statements (1 sentence each)
- growthAreas: Array of 2-3 short growth area statements (1 sentence each)
- frameworkInsights: Array of 2-3 short therapeutic observations (1 sentence each)
- emotionalTrends: Array of 3-4 short trend descriptions (under 15 words each)

No markdown, just JSON.`,
    [{ role: 'user', content: `Here are ${indexed.length} journal entry summaries:\n\n${entrySummaries}` }],
    4000,
    signal,
  )

  try {
    const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    return ProfileResponseSchema.parse(JSON.parse(cleaned))
  } catch (e) {
    console.error('[processor] Failed to parse profile response:', response, e)
    throw new Error(`Failed to generate profile: ${e}`)
  }
}

const OPUS_MODEL = 'claude-opus-4-6'

export async function generateFullProfile(
  entries: JournalEntry[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const indexed = entries.filter((e) => e.indexed)

  // Build full entry content for Opus (send actual content, not just summaries)
  const entryContent = indexed
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((e) => {
      const date = e.createdAt.slice(0, 10)
      const mood = e.mood ? `${e.mood.value}/10 (${e.mood.label})` : 'unscored'
      const tags = e.tags.length > 0 ? e.tags.join(', ') : 'none'
      return `--- Entry: ${date} | "${e.title}" | Mood: ${mood} | Tags: ${tags} ---\n${e.content}`
    })
    .join('\n\n')

  const response = await sendMessage(
    apiKey,
    OPUS_MODEL,
    `You are a clinical psychologist writing a comprehensive psychological profile based on a person's journal entries. This is a clinical formulation document — not a journal summary.

Write in the voice of a clinical supervisor preparing notes for a supervision session: clinically precise, warm, and deeply attentive to the person behind the data.

Structure the profile with these markdown sections:

# Comprehensive Psychological Profile

## I. Core Personality Structure
- Cognitive style and processing patterns
- Emotional architecture (how they experience and process emotions)
- Self-concept and identity patterns

## II. Relational Patterns
- Key relationships and attachment dynamics
- Recurring interpersonal themes
- Social patterns and challenges

## III. Core Psychological Dynamics
- Primary behavioural/cognitive loops (e.g. seeking cycles, avoidance patterns)
- Insight-action gaps
- Identity development trajectory

## IV. Emotional Wellbeing Trajectory
- Timeline of emotional states across the journal period
- Key turning points and crises
- Overall direction of change

## V. Strengths & Protective Factors
- Evidence-based strengths observed across entries
- Coping resources and resilience indicators

## VI. Risk Factors & Vulnerabilities
- Areas of ongoing vulnerability
- Patterns that could re-emerge under stress

## VII. Clinical Observations & Recommendations
- Therapeutic frameworks that apply (CBT, ACT, etc.)
- Specific patterns warranting attention
- Growth trajectory and prognosis

Guidelines:
- Name specific people, events, and dates from the entries
- Quote or closely paraphrase specific entry content as evidence for observations
- Use accurate psychological terminology while remaining accessible
- Balance clinical rigour with genuine care — this is a real person's inner world
- Identify patterns across time, not just individual events
- Note where the person has grown and where they are still working through things
- Write 2000-4000 words — thorough but not exhaustive
- Output as clean markdown with proper heading hierarchy`,
    [{ role: 'user', content: `Here are ${indexed.length} journal entries for psychological analysis:\n\n${entryContent}` }],
    8000,
    signal,
  )

  return response
}

// Local computation — no API call needed
export function computeLocalStats(entries: JournalEntry[]): {
  averageMood: number
  journalingStreak: number
  avgEntryLength: number
  reflectionDepth: 'Low' | 'Medium' | 'High'
} {
  const indexed = entries.filter((e) => e.indexed)
  if (indexed.length === 0) {
    return {
      averageMood: 0,
      journalingStreak: 0,
      avgEntryLength: 0,
      reflectionDepth: 'Low',
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

  return { averageMood, journalingStreak, avgEntryLength, reflectionDepth }
}

function getPreviousDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

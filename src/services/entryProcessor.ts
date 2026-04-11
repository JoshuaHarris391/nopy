import { sendMessage } from './anthropic'
import { parseLLMJson } from './parseLLMJson'
import { HAIKU_MODEL, OPUS_MODEL, TOKEN_LIMITS } from './models'
import { ENTRY_METADATA_SYSTEM } from './prompts/entryMetadata'
import { PROFILE_NARRATIVE_SYSTEM } from './prompts/profileNarrative'
import { FULL_PROFILE_SYSTEM } from './prompts/fullProfile'
import type { JournalEntry, MoodLabel } from '../types/journal'
import type { z } from 'zod'
import type { LocalStatsSchema } from '../schemas/profile'
import { EntryMetadataCoercedSchema } from '../schemas/journal'
import { ProfileResponseSchema } from '../schemas/profile'

interface EntryMetadata {
  mood: { value: number; label: MoodLabel }
  tags: string[]
  summary: string
}

export async function processEntry(entry: JournalEntry, apiKey: string, signal?: AbortSignal): Promise<EntryMetadata> {
  const inputChars = (entry.title.length + entry.content.length)
  console.log('[entryProcessor] processEntry: input', inputChars, 'chars')
  const response = await sendMessage(
    apiKey,
    HAIKU_MODEL,
    ENTRY_METADATA_SYSTEM,
    [{ role: 'user', content: `Title: ${entry.title}\n\n${entry.content}` }],
    TOKEN_LIMITS.entryMetadata,
    signal,
  )

  console.log('[entryProcessor] processEntry: response', response.length, 'chars')
  const parsed = parseLLMJson(response, EntryMetadataCoercedSchema)
  console.log('[entryProcessor] processEntry: parsed ok — mood:', parsed.mood.value, '/', parsed.mood.label, '| tags:', parsed.tags.length, '| summary:', parsed.summary.length, 'chars')
  return parsed
}

export async function processAllEntries(
  entries: JournalEntry[],
  apiKey: string,
  force: boolean,
  onProgress: (current: number, total: number, entryTitle: string) => void,
  signal?: AbortSignal,
): Promise<Map<string, EntryMetadata>> {
  const toProcess = force ? entries : entries.filter((e) => !e.indexed)
  console.log('[entryProcessor] processAllEntries: total', entries.length, '| to process', toProcess.length, '| skipped (already indexed)', entries.length - toProcess.length, '| force:', force)
  const results = new Map<string, EntryMetadata>()

  for (let i = 0; i < toProcess.length; i++) {
    if (signal?.aborted) break
    const entry = toProcess[i]
    onProgress(i + 1, toProcess.length, entry.title)
    try {
      const metadata = await processEntry(entry, apiKey, signal)
      results.set(entry.id, metadata)
    } catch (e) {
      console.error('[entryProcessor] processAllEntries: entry', i + 1, 'of', toProcess.length, 'failed —', e)
    }
  }

  console.log('[entryProcessor] processAllEntries: complete —', results.size, 'of', toProcess.length, 'succeeded')
  return results
}

export async function generateProfileFromEntries(
  entries: JournalEntry[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<z.infer<typeof ProfileResponseSchema>> {
  const indexed = entries.filter((e) => e.indexed && e.summary)
  console.log('[entryProcessor] generateProfileFromEntries: indexed entries', indexed.length)
  if (indexed.length === 0) {
    throw new Error('No indexed entries with summaries available — index entries before generating a profile')
  }
  const entrySummaries = indexed
    .map((e) => `[${e.createdAt.slice(0, 10)}] ${e.title}: ${e.summary} (mood: ${e.mood?.value ?? 'n/a'}/10, tags: ${e.tags.join(', ')})`)
    .join('\n')

  console.log('[entryProcessor] generateProfileFromEntries: sending', entrySummaries.length, 'chars to Haiku')
  const response = await sendMessage(
    apiKey,
    HAIKU_MODEL,
    PROFILE_NARRATIVE_SYSTEM,
    [{ role: 'user', content: `Here are ${indexed.length} journal entry summaries:\n\n${entrySummaries}` }],
    TOKEN_LIMITS.profileNarrative,
    signal,
  )

  console.log('[entryProcessor] generateProfileFromEntries: response', response.length, 'chars')
  const parsed = parseLLMJson(response, ProfileResponseSchema)
  console.log('[entryProcessor] generateProfileFromEntries: parsed ok — themes:', parsed.themes.length, '| cognitivePatterns:', parsed.cognitivePatterns.length, '| strengths:', parsed.strengths.length)
  return parsed
}

export async function generateFullProfile(
  entries: JournalEntry[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const indexed = entries.filter((e) => e.indexed)
  console.log('[entryProcessor] generateFullProfile: indexed entries', indexed.length)

  const entryContent = indexed
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((e) => {
      const date = e.createdAt.slice(0, 10)
      const mood = e.mood ? `${e.mood.value}/10 (${e.mood.label})` : 'unscored'
      const tags = e.tags.length > 0 ? e.tags.join(', ') : 'none'
      return `--- Entry: ${date} | "${e.title}" | Mood: ${mood} | Tags: ${tags} ---\n${e.content}`
    })
    .join('\n\n')

  console.log('[entryProcessor] generateFullProfile: sending', entryContent.length, 'chars to Opus')
  const response = await sendMessage(
    apiKey,
    OPUS_MODEL,
    FULL_PROFILE_SYSTEM,
    [{ role: 'user', content: `Here are ${indexed.length} journal entries for psychological analysis:\n\n${entryContent}` }],
    TOKEN_LIMITS.fullProfile,
    signal,
  )

  console.log('[entryProcessor] generateFullProfile: response', response.length, 'chars')
  return response
}

export function computeLocalStats(entries: JournalEntry[]): z.infer<typeof LocalStatsSchema> {
  console.log('[entryProcessor] computeLocalStats: entries', entries.length)
  const indexed = entries.filter((e) => e.indexed)
  if (indexed.length === 0) {
    console.log('[entryProcessor] computeLocalStats: no indexed entries — returning zeros')
    return { averageMood: 0, journalingStreak: 0, avgEntryLength: 0, reflectionDepth: 'Low' }
  }

  const moodsWithValues = indexed.filter((e) => e.mood?.value)
  const averageMood = moodsWithValues.length > 0
    ? Math.round((moodsWithValues.reduce((sum, e) => sum + (e.mood?.value ?? 0), 0) / moodsWithValues.length) * 10) / 10
    : 0

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

  const totalWords = entries.reduce((sum, e) => sum + e.content.split(/\s+/).filter(Boolean).length, 0)
  const avgEntryLength = Math.round(totalWords / entries.length)

  const reflectionDepth: 'Low' | 'Medium' | 'High' =
    avgEntryLength >= 300 ? 'High' : avgEntryLength >= 150 ? 'Medium' : 'Low'

  console.log('[entryProcessor] computeLocalStats: averageMood', averageMood, '| streak', journalingStreak, '| avgEntryLength', avgEntryLength, '| reflectionDepth', reflectionDepth)
  return { averageMood, journalingStreak, avgEntryLength, reflectionDepth }
}

function getPreviousDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

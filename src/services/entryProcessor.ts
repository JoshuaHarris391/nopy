import { sendMessage, sendMessageStreaming, resolveModel, type Message } from './llm'
import { parseLLMJson, LLMParseError } from './parseLLMJson'
import { TOKEN_LIMITS, DEFAULT_CONTEXT_WINDOW } from './models'
import { ENTRY_METADATA_SYSTEM, buildEntryIndexUserMessage } from './prompts/entryMetadata'
import { PROFILE_NARRATIVE_SYSTEM } from './prompts/profileNarrative'
import { FULL_PROFILE_SYSTEM, FULL_PROFILE_REVISE_SYSTEM } from './prompts/fullProfile'
import type { JournalEntry } from '../types/journal'
import type { LlmConfig } from '../types/settings'
import { ZodError, type z } from 'zod'
import type { LocalStatsSchema } from '../schemas/profile'
import { EntryRecordCoercedSchema, CURRENT_INDEX_VERSION } from '../schemas/journal'
import { ProfileResponseSchema } from '../schemas/profile'
import {
  finaliseRecord, buildIndexHints, isStaleIndex, fitRecordsToBudget, buildCorpusReport,
  type EntryRecord, type IndexHints, type CorpusReport,
} from './entryRecords'
import { estimateTokens } from '../utils/tokenEstimator'

/** One indexed entry's record plus the instrument that produced it. */
export interface ProcessedEntry extends EntryRecord {
  indexModel: string
}

/** Which entries an indexing run should (re)process. */
export type IndexRunMode = 'unindexed' | 'stale' | 'needed' | 'all'

export function selectEntriesForIndexing(entries: JournalEntry[], mode: IndexRunMode): JournalEntry[] {
  switch (mode) {
    case 'unindexed': return entries.filter((e) => !e.indexed)
    case 'stale': return entries.filter(isStaleIndex)
    // Never indexed, or indexed without a usable record.
    case 'needed': return entries.filter((e) => !e.indexed || isStaleIndex(e))
    case 'all': return entries
  }
}

/** Retries after the first attempt when the index response is unusable. */
export const MAX_INDEX_RETRIES = 3

/**
 * Problems in a parsed record that mean "the model did not do the job",
 * as opposed to a merely thin entry. A one-line entry legitimately yields
 * null states and no quotes, so only structural failures count: a missing
 * summary, no domains, or a response so off-vocabulary that most of what
 * it said landed in `unclassified`.
 */
export function findRecordProblems(record: EntryRecord): string[] {
  const problems: string[] = []
  if (!record.summary || record.summary.length < 20) problems.push('summary is missing or shorter than one sentence')
  if (record.domains.length === 0) problems.push('domains is empty; choose 1-4 from the domains vocabulary')
  const classified = record.insight.emotions.length + record.insight.people.length + record.insight.coping.length
  if (record.insight.unclassified.length >= 3 && record.insight.unclassified.length > classified) {
    problems.push(`these terms are not in any vocabulary: ${record.insight.unclassified.join(', ')}. Use the closest vocabulary value or "other"`)
  }
  return problems
}

/**
 * Index one entry: the only place raw journal text is handed to an LLM.
 * `hints` carry the writer's stated mood, the known-people roster and the
 * recurring phrases so records stay consistent across entries; they go in
 * the user message so the system prompt stays cacheable.
 *
 * If the response is not parseable JSON, fails the schema, or comes back
 * degenerate (see `findRecordProblems`), the model is asked to repair it:
 * the conversation is extended with its own output and the specific
 * problems, up to MAX_INDEX_RETRIES times. The last usable record wins;
 * if none is usable the final error is thrown and the entry stays
 * unindexed for this run.
 *
 * Errors from the provider itself (bad key, rate limit, a truncated or
 * declined answer) are not repaired here: they propagate to the caller,
 * which decides whether they end the run (see `processAllEntries`).
 */
export async function processEntry(
  entry: JournalEntry,
  config: LlmConfig,
  signal?: AbortSignal,
  hints?: IndexHints,
): Promise<ProcessedEntry> {
  const inputChars = (entry.title.length + entry.content.length)
  console.log('[entryProcessor] processEntry: input', inputChars, 'chars | roster', hints?.roster.length ?? 0, '| recent phrases', hints?.recentQuotes.length ?? 0)
  const messages: Message[] = [{ role: 'user', content: buildEntryIndexUserMessage(entry, hints) }]
  let lastError: unknown = null

  for (let attempt = 0; attempt <= MAX_INDEX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const response = await sendMessage(config, 'lightweight', ENTRY_METADATA_SYSTEM, [...messages], TOKEN_LIMITS.entryMetadata, signal)
    console.log('[entryProcessor] processEntry: attempt', attempt + 1, '| response', response.length, 'chars')

    // Nothing to repair in an empty reply, and an empty assistant turn is
    // rejected by the API: ask again with the conversation as it stands.
    if (!response.trim()) {
      lastError = new Error('The model returned an empty response.')
      if (attempt === MAX_INDEX_RETRIES) break
      console.warn('[entryProcessor] processEntry: attempt', attempt + 1, 'returned no text — asking again')
      continue
    }

    let problems: string[]
    try {
      const loose = parseLLMJson(response, EntryRecordCoercedSchema)
      const record = finaliseRecord(loose, entry.content, hints)
      problems = findRecordProblems(record)
      if (problems.length === 0) {
        console.log('[entryProcessor] processEntry: parsed ok — mood:', record.mood.value, '/', record.mood.label, '| domains:', record.domains.join(','), '| quotes:', record.insight.quotes.length, '| people:', record.insight.people.length, '| safety:', record.insight.safety.flag, '| unclassified:', record.insight.unclassified.length)
        return { ...record, indexModel: resolveModel(config, 'lightweight') }
      }
      lastError = new Error(`Index record unusable after ${attempt + 1} attempt(s): ${problems.join('; ')}`)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      if (!(e instanceof LLMParseError)) throw e
      lastError = e
      problems = describeParseError(e)
    }

    if (attempt === MAX_INDEX_RETRIES) break
    console.warn('[entryProcessor] processEntry: attempt', attempt + 1, 'unusable —', problems.join('; '), '— retrying')
    messages.push(
      { role: 'assistant', content: response },
      { role: 'user', content: buildRepairMessage(problems) },
    )
  }

  throw lastError instanceof Error ? lastError : new Error('Index record unusable')
}

/** One line per schema issue ("states.anxiety.value: expected number"), or the parse failure itself. */
function describeParseError(e: LLMParseError): string[] {
  if (e.cause instanceof ZodError) {
    return e.cause.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
  }
  return ['the response was not a valid JSON object (no prose, no code fences, no trailing text)']
}

function buildRepairMessage(problems: string[]): string {
  return [
    'That response could not be stored. Problems:',
    ...problems.map((p) => `- ${p}`),
    '',
    'Return the corrected JSON object for the same entry, matching the schema and vocabularies in the instructions exactly. Output only the JSON object.',
  ].join('\n')
}

/** One entry an indexing run could not index, with a reason fit to show the writer. */
export interface IndexFailure {
  id: string
  title: string
  reason: string
}

/** What an indexing run did. `attempted` is how many entries it set out to index. */
export interface IndexRunSummary {
  attempted: number
  indexed: number
  failed: IndexFailure[]
}

export interface IndexBatchResult extends IndexRunSummary {
  results: Map<string, ProcessedEntry>
}

/** Progress callback: the entry about to be indexed, plus the tallies so far. */
export type IndexProgress = (
  current: number,
  total: number,
  entryTitle: string,
  counts?: { indexed: number; failed: number },
) => void

export interface IndexRunHooks {
  /**
   * Called as soon as one entry's record is ready, before the next entry is
   * sent. The store saves the record here, so a run that is stopped or cut
   * short keeps everything it finished. If this throws, the entry is
   * reported as failed with the thrown message.
   */
  onRecord?: (entryId: string, record: ProcessedEntry) => Promise<void> | void
}

/**
 * Thrown when a run is stopped early by a problem that would fail every
 * remaining entry the same way. Carries what the run achieved before it
 * stopped; those entries are already saved.
 */
export class IndexRunError extends Error {
  readonly summary: IndexRunSummary
  constructor(message: string, summary: IndexRunSummary, cause?: unknown) {
    super(message, { cause })
    this.name = 'IndexRunError'
    this.summary = summary
  }
}

/** A run stops after this many entries fail back to back: the setup is broken, not the entries. */
export const MAX_CONSECUTIVE_INDEX_FAILURES = 3

/**
 * Provider errors that are about this one entry (its answer was cut off or
 * declined, or the entry is too long for the model). Every other provider
 * error (bad key, rate limit, no connection, no model) would hit the next
 * entry too, so it ends the run.
 */
const ENTRY_SPECIFIC_LLM_CODES = new Set(['OUTPUT_TRUNCATED', 'REFUSED', 'CONTEXT_TOO_LARGE'])

/** Duck-typed on `name`/`code` rather than `instanceof` so it survives module mocking in tests. */
function llmErrorCode(e: unknown): string | null {
  const err = e as { name?: unknown; code?: unknown } | null
  return err && err.name === 'LlmError' && typeof err.code === 'string' ? err.code : null
}

/** One sentence the writer can read, for a failure on a single entry. */
function describeIndexFailure(e: unknown): string {
  if (e instanceof LLMParseError) {
    return e.cause instanceof ZodError
      ? "The model's response did not match the index format."
      : 'The model did not return valid JSON.'
  }
  const message = e instanceof Error ? e.message : String(e)
  return message.length > 240 ? `${message.slice(0, 240)}…` : message
}

/**
 * Index a batch, one entry at a time, oldest first.
 *
 * Each finished record is handed to `hooks.onRecord` straight away, so
 * nothing waits for the end of the run to be saved. A failure on one entry
 * is recorded with its reason and the run moves on; a provider error that
 * is not about the entry, or MAX_CONSECUTIVE_INDEX_FAILURES failures in a
 * row, stops the run with an `IndexRunError`. Stopping via `signal` ends the
 * run quietly and returns what was done.
 */
export async function processAllEntries(
  entries: JournalEntry[],
  config: LlmConfig,
  mode: IndexRunMode,
  onProgress: IndexProgress,
  signal?: AbortSignal,
  hooks: IndexRunHooks = {},
): Promise<IndexBatchResult> {
  // Oldest first, so the roster and recurring phrases accumulate in the
  // order the writer lived them. The hints are threaded through `results`
  // in memory, independent of when the caller saves each record.
  const toProcess = selectEntriesForIndexing(entries, mode)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const processingIds = new Set(toProcess.map((e) => e.id))
  console.log('[entryProcessor] processAllEntries: total', entries.length, '| to process', toProcess.length, '| mode:', mode)
  const results = new Map<string, ProcessedEntry>()
  const failed: IndexFailure[] = []
  let indexed = 0
  let consecutiveFailures = 0
  const summary = (): IndexRunSummary => ({ attempted: toProcess.length, indexed, failed: [...failed] })

  const withResults = (): JournalEntry[] => entries.map((e) => {
    const r = results.get(e.id)
    if (r) return { ...e, tags: r.domains, summary: r.summary, insight: r.insight, indexed: true, indexVersion: CURRENT_INDEX_VERSION }
    // A re-run over everything must not feed stale records from the old
    // index into the hints for entries that haven't been redone yet.
    return processingIds.has(e.id) ? { ...e, insight: null, indexed: false } : e
  })

  for (let i = 0; i < toProcess.length; i++) {
    if (signal?.aborted) break
    const entry = toProcess[i]
    onProgress(i + 1, toProcess.length, entry.title, { indexed, failed: failed.length })
    try {
      const hints = buildIndexHints(withResults(), entry)
      const record = await processEntry(entry, config, signal, hints)
      // A record that arrives after Stop was pressed is not saved.
      if (signal?.aborted) break
      results.set(entry.id, record)
      await hooks.onRecord?.(entry.id, record)
      indexed++
      consecutiveFailures = 0
    } catch (e) {
      // A stopped run surfaces as whatever the provider SDK throws on abort.
      if (signal?.aborted) break
      console.error('[entryProcessor] processAllEntries: entry', i + 1, 'of', toProcess.length, 'failed —', e)
      const code = llmErrorCode(e)
      if (code && !ENTRY_SPECIFIC_LLM_CODES.has(code)) {
        const reason = e instanceof Error ? e.message : String(e)
        throw new IndexRunError(indexed > 0 ? `Stopped after ${indexed} of ${toProcess.length} entries. ${reason}` : reason, summary(), e)
      }
      failed.push({ id: entry.id, title: entry.title, reason: describeIndexFailure(e) })
      consecutiveFailures++
      if (consecutiveFailures >= MAX_CONSECUTIVE_INDEX_FAILURES && i < toProcess.length - 1) {
        const last = failed[failed.length - 1].reason
        throw new IndexRunError(`Stopped after ${consecutiveFailures} entries in a row failed. ${last}`, summary(), e)
      }
    }
  }

  console.log('[entryProcessor] processAllEntries: complete —', indexed, 'of', toProcess.length, 'indexed |', failed.length, 'failed')
  return { results, ...summary() }
}

export interface NarrativeProfileOptions {
  /** The corpus report over the whole journal. Built here if omitted. */
  corpusReport?: CorpusReport
  /** Lightweight model's context window; records are fitted into what remains. */
  contextWindowTokens?: number
  onStreamProgress?: (charsReceived: number) => void
  signal?: AbortSignal
}

/**
 * Summary profile (structured JSON) from the corpus report plus brief
 * records for the recent window and one-line digests for older entries,
 * fitted to the lightweight model's window. Never reads `entry.content`.
 * Lightweight model, streaming.
 */
export async function generateProfileFromEntries(
  entries: JournalEntry[],
  config: LlmConfig,
  opts: NarrativeProfileOptions = {},
): Promise<z.infer<typeof ProfileResponseSchema>> {
  const indexed = entries.filter((e) => e.indexed && e.summary)
  console.log('[entryProcessor] generateProfileFromEntries: indexed entries', indexed.length)
  if (indexed.length === 0) {
    throw new Error('No indexed entries with summaries available — index entries before generating a profile')
  }
  const report = opts.corpusReport ?? buildCorpusReport(entries)
  const windowTokens = opts.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW.local
  const overhead = estimateTokens(PROFILE_NARRATIVE_SYSTEM) + estimateTokens(report.text) + TOKEN_LIMITS.profileNarrative
  const budget = Math.max(0, Math.floor(windowTokens * 0.9) - overhead)
  const fitted = fitRecordsToBudget(indexed, budget, report.recurring, { recentTier: 'brief' })
  console.log('[entryProcessor] generateProfileFromEntries: budget', budget, 'tokens | brief', fitted.standard, '| digest', fitted.digest, '| omitted', fitted.dropped)
  const content = `${report.text}\n\n# Entry records (${fitted.included}, oldest first)\n\n${fitted.text}`

  console.log('[entryProcessor] generateProfileFromEntries: sending', content.length, 'chars to lightweight model')
  const response = await sendMessageStreaming(
    config,
    'lightweight',
    PROFILE_NARRATIVE_SYSTEM,
    [{ role: 'user', content }],
    TOKEN_LIMITS.profileNarrative,
    opts.onStreamProgress ?? (() => {}),
    opts.signal,
  )

  console.log('[entryProcessor] generateProfileFromEntries: response', response.length, 'chars')
  const parsed = parseLLMJson(response, ProfileResponseSchema)
  console.log('[entryProcessor] generateProfileFromEntries: parsed ok — themes:', parsed.themes.length, '| cognitivePatterns:', parsed.cognitivePatterns.length, '| strengths:', parsed.strengths.length)
  return parsed
}

export interface FullProfileOptions {
  /** The corpus report over the whole journal (always the full time series). */
  corpusReport: CorpusReport
  /** When set, the model revises this profile with only the given entries' records. */
  priorProfile?: string | null
  /** Main model's context window; records are fitted into what remains. */
  contextWindowTokens: number
  onStreamProgress?: (charsReceived: number) => void
  signal?: AbortSignal
}

/**
 * Full psychological profile (markdown) from index records only. Never
 * reads `entry.content`: the corpus report and the rendered records are
 * the whole input. Main model, streaming.
 */
export async function generateFullProfile(
  entries: JournalEntry[],
  config: LlmConfig,
  opts: FullProfileOptions,
): Promise<string> {
  const indexed = entries.filter((e) => e.indexed)
  const isRevision = !!opts.priorProfile
  const system = isRevision ? FULL_PROFILE_REVISE_SYSTEM : FULL_PROFILE_SYSTEM
  console.log('[entryProcessor] generateFullProfile: indexed entries', indexed.length, '| revision:', isRevision)

  const preamble = isRevision
    ? `# Previous profile\n\n${opts.priorProfile}\n\n${opts.corpusReport.text}`
    : opts.corpusReport.text
  const overhead = estimateTokens(system) + estimateTokens(preamble) + TOKEN_LIMITS.fullProfile
  const budget = Math.max(0, Math.floor(opts.contextWindowTokens * 0.9) - overhead)
  const fitted = fitRecordsToBudget(indexed, budget, opts.corpusReport.recurring)
  console.log('[entryProcessor] generateFullProfile: budget', budget, 'tokens | standard', fitted.standard, '| digest', fitted.digest, '| omitted', fitted.dropped)
  const heading = isRevision
    ? `# New entry records since the previous profile (${fitted.included}, oldest first)`
    : `# Entry records (${fitted.included}, oldest first)`
  const content = `${preamble}\n\n${heading}\n\n${fitted.text}`

  console.log('[entryProcessor] generateFullProfile: sending', content.length, 'chars to main model')
  const response = await sendMessageStreaming(
    config,
    'main',
    system,
    [{ role: 'user', content }],
    TOKEN_LIMITS.fullProfile,
    opts.onStreamProgress ?? (() => {}),
    opts.signal,
  )

  console.log('[entryProcessor] generateFullProfile: response', response.length, 'chars')
  return response
}

/** Mean mood (1 decimal) over entries that have a mood value; null if none do. */
function computeAverageMood(entries: JournalEntry[]): number | null {
  const moods = entries.filter((e) => e.mood?.value != null)
  if (moods.length === 0) return null
  return Math.round((moods.reduce((sum, e) => sum + (e.mood?.value ?? 0), 0) / moods.length) * 10) / 10
}

/** Mean word count per entry. Callers must pass a non-empty array. */
function computeAvgEntryLength(entries: JournalEntry[]): number {
  const totalWords = entries.reduce((sum, e) => sum + e.content.split(/\s+/).filter(Boolean).length, 0)
  return Math.round(totalWords / entries.length)
}

function computeReflectionDepth(avgEntryLength: number): 'Low' | 'Medium' | 'High' {
  return avgEntryLength >= 300 ? 'High' : avgEntryLength >= 150 ? 'Medium' : 'Low'
}

export function computeLocalStats(entries: JournalEntry[]): z.infer<typeof LocalStatsSchema> {
  console.log('[entryProcessor] computeLocalStats: entries', entries.length)
  const indexed = entries.filter((e) => e.indexed)
  if (indexed.length === 0) {
    console.log('[entryProcessor] computeLocalStats: no indexed entries — returning zeros')
    return { averageMood: 0, journalingStreak: 0, avgEntryLength: 0, reflectionDepth: 'Low' }
  }

  const averageMood = computeAverageMood(indexed) ?? 0

  const journalingStreak = computeJournalingStreak(entries)

  const avgEntryLength = computeAvgEntryLength(entries)
  const reflectionDepth = computeReflectionDepth(avgEntryLength)

  console.log('[entryProcessor] computeLocalStats: averageMood', averageMood, '| streak', journalingStreak, '| avgEntryLength', avgEntryLength, '| reflectionDepth', reflectionDepth)
  return { averageMood, journalingStreak, avgEntryLength, reflectionDepth }
}

/**
 * Computes the mood/length/depth stats for entries falling within a single
 * [start, end] window, so the Wellbeing cards can track the period shown in the
 * Mood Over Time chart. Average mood is taken over entries with a mood value
 * (matching the points the chart plots), not over `indexed` entries. Returns
 * null fields for an empty window so the UI can show a '--' placeholder.
 */
export function computeWindowedStats(
  entries: JournalEntry[],
  start: Date,
  end: Date,
): { averageMood: number | null; avgEntryLength: number | null; reflectionDepth: 'Low' | 'Medium' | 'High' | null } {
  const s = start.getTime()
  const e = end.getTime()
  const windowed = entries.filter((entry) => {
    const t = new Date(entry.createdAt).getTime()
    return t >= s && t <= e
  })
  if (windowed.length === 0) return { averageMood: null, avgEntryLength: null, reflectionDepth: null }

  const averageMood = computeAverageMood(windowed)
  const avgEntryLength = computeAvgEntryLength(windowed)
  const reflectionDepth = computeReflectionDepth(avgEntryLength)

  return { averageMood, avgEntryLength, reflectionDepth }
}

/**
 * Consecutive days with at least one entry, counting back from today (or
 * yesterday, so a streak survives until the day is over). Not window-scoped.
 */
export function computeJournalingStreak(entries: JournalEntry[], today = new Date()): number {
  const dates = [...new Set(entries.map((e) => e.createdAt.slice(0, 10)))].sort().reverse()
  let streak = 0
  let checkDate = today.toISOString().slice(0, 10)
  for (const date of dates) {
    if (date === checkDate || date === getPreviousDay(checkDate)) {
      streak++
      checkDate = date
    } else {
      break
    }
  }
  return streak
}

function getPreviousDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

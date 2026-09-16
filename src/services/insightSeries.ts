/**
 * Local time-series over the structured entry index for the Insights page.
 * Pure: no React, no store, no LLM. Everything is derived from
 * `entry.mood` and `entry.insight`, bucketed on a dense grid so every chart
 * shares the same x positions for a given window.
 */
import type { JournalEntry, MoodLabel, StateKey } from '../types/journal'
import { STATE_KEYS, REPORT_STATE_CONFIDENCE, DomainSchema } from '../schemas/journal'
import { hasStructuredIndex, isWriterRated, isStaleIndex } from './entryRecords'
import { computeWindowedStats } from './entryProcessor'
import { moodLabelColors } from '../utils/mood'
import { OTHER_KEY } from '../utils/chartColors'
import { bucketBounds, type BucketBounds, type Granularity, type TimeWindow } from '../utils/timeSeries'

export interface Bucket extends BucketBounds {
  /** Entries whose createdAt falls inside the bucket, oldest first. */
  entries: JournalEntry[]
}

export interface SeriesPoint {
  /** Milliseconds: the entry's createdAt for per-entry points, the bucket midpoint for means. */
  t: number
  value: number
  /** Sample size behind a bucket mean. */
  n?: number
  bucketKey?: string
  entryId?: string
  label?: string
}

export const STATE_LABELS: Record<StateKey, string> = {
  anxiety: 'Anxiety', irritability: 'Irritability', sadness: 'Sadness', calm: 'Calm',
  agency: 'Agency', connection: 'Connection', meaning: 'Meaning',
}

function inWindow(entry: JournalEntry, window: TimeWindow): boolean {
  const t = new Date(entry.createdAt).getTime()
  return t >= window.start.getTime() && t <= window.end.getTime()
}

function midpoint(b: BucketBounds): number {
  return (b.start.getTime() + b.end.getTime()) / 2
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

/** Dense buckets; empty ones are kept so charts share x positions. */
export function bucketEntries(entries: JournalEntry[], window: TimeWindow, granularity: Granularity): Bucket[] {
  const buckets: Bucket[] = bucketBounds(window, granularity).map((b) => ({ ...b, entries: [] }))
  const sorted = [...entries]
    .filter((e) => inWindow(e, window))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  for (const e of sorted) {
    const t = new Date(e.createdAt).getTime()
    const bucket = buckets.find((b) => t >= b.start.getTime() && t <= b.end.getTime())
    if (bucket) bucket.entries.push(e)
  }
  return buckets
}

function bucketMeans(buckets: Bucket[], pick: (e: JournalEntry) => number | null): SeriesPoint[] {
  const out: SeriesPoint[] = []
  for (const b of buckets) {
    const vals = b.entries.map(pick).filter((v): v is number => v != null)
    if (vals.length === 0) continue
    out.push({ t: midpoint(b), value: round1(mean(vals)), n: vals.length, bucketKey: b.key })
  }
  return out
}

// ---------------------------------------------------------------------------
// Mood
// ---------------------------------------------------------------------------

export interface MoodPoint extends SeriesPoint {
  entryId: string
  label: string
  /** Writer-rated moods are the primary metric; inferred ones are the indexer's estimate. */
  source: 'writer' | 'inferred'
  moodLabel: MoodLabel
  color: string
}

export interface MoodSeriesResult { points: MoodPoint[]; means: SeriesPoint[] }

/** One point per entry that has a mood (never both the mood and the inferred mood for one entry). */
export function moodSeries(buckets: Bucket[]): MoodSeriesResult {
  const points: MoodPoint[] = []
  for (const b of buckets) {
    for (const e of b.entries) {
      if (!e.mood) continue
      points.push({
        t: new Date(e.createdAt).getTime(),
        value: e.mood.value,
        entryId: e.id,
        label: e.title,
        bucketKey: b.key,
        source: isWriterRated(e) ? 'writer' : 'inferred',
        moodLabel: e.mood.label,
        color: moodLabelColors[e.mood.label],
      })
    }
  }
  return { points, means: bucketMeans(buckets, (e) => e.mood?.value ?? null) }
}

// ---------------------------------------------------------------------------
// Inferred states
// ---------------------------------------------------------------------------

export interface StateSeriesResult { key: StateKey; label: string; means: SeriesPoint[] }

/** Bucket means over confident values only; per-entry points would be noise for seven series. */
export function stateSeries(buckets: Bucket[], key: StateKey, minConfidence = REPORT_STATE_CONFIDENCE): StateSeriesResult {
  const means = bucketMeans(buckets, (e) => {
    if (!hasStructuredIndex(e)) return null
    const s = e.insight.states[key]
    return s.value != null && (s.confidence ?? 0) >= minConfidence ? s.value : null
  })
  return { key, label: STATE_LABELS[key], means }
}

export function allStateSeries(buckets: Bucket[], minConfidence = REPORT_STATE_CONFIDENCE): Record<StateKey, StateSeriesResult> {
  return Object.fromEntries(STATE_KEYS.map((k) => [k, stateSeries(buckets, k, minConfidence)])) as Record<StateKey, StateSeriesResult>
}

// ---------------------------------------------------------------------------
// Categories (emotions, domains, body events)
// ---------------------------------------------------------------------------

export interface CategoryBucket {
  key: string
  label: string
  start: Date
  /** Sum of every count in the bucket, including "other". */
  total: number
  counts: Record<string, number>
}

export interface CategorySeriesResult {
  /** Top-N by window-wide count, then "other" when anything was folded. */
  categories: string[]
  /** Dense: one per input bucket. */
  buckets: CategoryBucket[]
}

/**
 * Shared engine: the top-N categories are chosen over the whole window so
 * colours stay stable across buckets; everything else folds into "other".
 * `extract` returns the categories one entry mentions (deduplicated here).
 */
export function categorySeries(buckets: Bucket[], extract: (e: JournalEntry) => string[], top: number): CategorySeriesResult {
  const totals = new Map<string, number>()
  const perEntry = new Map<string, string[]>()
  for (const b of buckets) {
    for (const e of b.entries) {
      const cats = [...new Set(extract(e))]
      perEntry.set(e.id, cats)
      for (const c of cats) totals.set(c, (totals.get(c) ?? 0) + 1)
    }
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c)
  const kept = ranked.slice(0, top)
  const hasOther = ranked.length > top
  const categories = hasOther ? [...kept, OTHER_KEY] : kept
  const keptSet = new Set(kept)

  const out: CategoryBucket[] = buckets.map((b) => {
    const counts: Record<string, number> = {}
    for (const c of categories) counts[c] = 0
    let total = 0
    for (const e of b.entries) {
      for (const c of perEntry.get(e.id) ?? []) {
        const k = keptSet.has(c) ? c : OTHER_KEY
        counts[k] = (counts[k] ?? 0) + 1
        total++
      }
    }
    return { key: b.key, label: b.label, start: b.start, total, counts }
  })
  return { categories, buckets: out }
}

/** Entries mentioning each emotion label (counts, not summed intensity, to agree with the corpus report). */
export function emotionSeries(buckets: Bucket[], top = 6): CategorySeriesResult {
  return categorySeries(buckets, (e) => (hasStructuredIndex(e) ? e.insight.emotions.map((x) => x.label) : []), top)
}

const DOMAIN_SET = new Set<string>(DomainSchema.options)

/** Closed domains only (legacy free-text tags are ignored). */
export function domainSeries(buckets: Bucket[], top = 6): CategorySeriesResult {
  return categorySeries(buckets, (e) => (hasStructuredIndex(e) ? e.tags.filter((t) => DOMAIN_SET.has(t)) : []), top)
}

// ---------------------------------------------------------------------------
// Sleep and body
// ---------------------------------------------------------------------------

export interface BodySeriesResult {
  /** Per-entry sleep hours. */
  sleep: SeriesPoint[]
  sleepMeans: SeriesPoint[]
  /** Substances and physical symptoms, counted per bucket. */
  events: CategorySeriesResult
}

export function bodySeries(buckets: Bucket[], top = 6): BodySeriesResult {
  const sleep: SeriesPoint[] = []
  for (const b of buckets) {
    for (const e of b.entries) {
      if (!hasStructuredIndex(e) || e.insight.body.sleepHours == null) continue
      sleep.push({ t: new Date(e.createdAt).getTime(), value: e.insight.body.sleepHours, entryId: e.id, label: e.title, bucketKey: b.key })
    }
  }
  const sleepMeans = bucketMeans(buckets, (e) => (hasStructuredIndex(e) ? e.insight.body.sleepHours : null))
  const events = categorySeries(buckets, (e) => (
    hasStructuredIndex(e) ? [...e.insight.body.substances.map((s) => s.type), ...e.insight.body.symptoms] : []
  ), top)
  return { sleep, sleepMeans, events }
}

// ---------------------------------------------------------------------------
// Window summary and safety
// ---------------------------------------------------------------------------

export interface WindowSummary {
  entryCount: number
  /** Over writer-rated entries only. */
  averageMood: number | null
  writerRatedCount: number
  avgEntryLength: number | null
  reflectionDepth: 'Low' | 'Medium' | 'High' | null
  distribution: Array<{ label: MoodLabel; count: number; percentage: number; color: string }>
  structuredCount: number
  /** Entries never indexed: fixed by Update Index on the Index page. */
  unindexedCount: number
  /** Indexed entries with an older or missing record: fixed by Re-index in Settings. */
  staleCount: number
}

const LABEL_ORDER: MoodLabel[] = ['great', 'good', 'neutral', 'mixed', 'low']

export function windowSummary(entries: JournalEntry[], window: TimeWindow): WindowSummary {
  const inside = entries.filter((e) => inWindow(e, window))
  const stats = computeWindowedStats(inside, window.start, window.end)
  const writerRated = inside.filter(isWriterRated)
  const averageMood = writerRated.length ? round1(mean(writerRated.map((e) => e.mood!.value))) : null
  const counts = new Map<MoodLabel, number>()
  for (const e of inside) if (e.mood) counts.set(e.mood.label, (counts.get(e.mood.label) ?? 0) + 1)
  const withMood = [...counts.values()].reduce((s, v) => s + v, 0)
  const distribution = LABEL_ORDER
    .filter((l) => counts.get(l))
    .map((l) => ({ label: l, count: counts.get(l)!, percentage: Math.round((counts.get(l)! / withMood) * 100), color: moodLabelColors[l] }))
  return {
    entryCount: inside.length,
    averageMood,
    writerRatedCount: writerRated.length,
    avgEntryLength: stats.avgEntryLength,
    reflectionDepth: stats.reflectionDepth,
    distribution,
    structuredCount: inside.filter(hasStructuredIndex).length,
    unindexedCount: inside.filter((e) => !e.indexed).length,
    staleCount: inside.filter(isStaleIndex).length,
  }
}

export interface SafetyRow { entryId: string; date: string; title: string; flag: 'monitor' | 'concern'; evidence: string | null }

export function safetyRows(entries: JournalEntry[], window: TimeWindow): SafetyRow[] {
  return entries
    .filter((e) => inWindow(e, window) && hasStructuredIndex(e) && e.insight.safety.flag !== 'none')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((e) => ({
      entryId: e.id,
      date: e.createdAt.slice(0, 10),
      title: e.title,
      flag: e.insight!.safety.flag as 'monitor' | 'concern',
      evidence: e.insight!.safety.evidence,
    }))
}

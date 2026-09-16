/**
 * Pure helpers around the structured entry index (v2).
 *
 * Three jobs live here, all deterministic and unit-testable:
 *  1. Turning the tolerant LLM response into a valid `EntryInsight`
 *     (vocabulary routing, verbatim-quote verification, roster leakage
 *     guards, confidence floors).
 *  2. Aggregating records across the journal: the people roster, recurring
 *     phrases, and the corpus report the profile step reads.
 *  3. Rendering one record, or a budget-fitted run of records, as compact
 *     text for a prompt.
 *
 * Nothing in this module reads `entry.content` except the guards that
 * verify quotes and people against it — the profile prompt never sees raw
 * journal text.
 */
import type {
  JournalEntry, EntryInsight, MoodScore, StateKey, PersonMention, EntryQuote,
  Observation, FeltAfter, SafetyFlag,
} from '../types/journal'
import type { PsychologicalProfile } from '../types/profile'
import {
  CURRENT_INDEX_VERSION, STATE_KEYS, MIN_STATE_CONFIDENCE, REPORT_STATE_CONFIDENCE,
  DomainSchema, EmotionLabelSchema, InteractionSchema, FeltAfterSchema, CopingStrategySchema,
  QuoteCategorySchema, MovementSchema, SubstanceTypeSchema, PhysicalSymptomSchema,
  SafetyFlagSchema, ObservationKindSchema, ObservationBasisSchema, MoodLabelSchema,
  type LooseEntryRecord,
} from '../schemas/journal'
import { monthKey, monthOf } from './journalBooks'
import { estimateTokens } from '../utils/tokenEstimator'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What `processEntry` returns and `applyProcessedMetadata` consumes. */
export interface EntryRecord {
  mood: MoodScore
  /** Closed domain values; stored in `JournalEntry.tags`. */
  domains: string[]
  summary: string
  insight: EntryInsight
}

export interface PeopleRosterItem {
  /** First-seen spelling. */
  name: string
  /** Distinct roles seen, most frequent first. */
  roles: string[]
  count: number
  firstSeen: string
  lastSeen: string
  feltAfterCounts: Partial<Record<FeltAfter, number>>
}

export interface RecurringQuote {
  /** First-seen spelling. */
  text: string
  count: number
  firstSeen: string
  lastSeen: string
  categories: string[]
}

/** Hints handed to the indexer alongside one entry. */
export interface IndexHints {
  roster: PeopleRosterItem[]
  recentQuotes: RecurringQuote[]
  /** The writer's own mood rating for this entry, if they set one. */
  statedMood: number | null
}

export type ProfileGenerationMode = 'incremental' | 'full'

// ---------------------------------------------------------------------------
// Index version helpers
// ---------------------------------------------------------------------------

export function getIndexVersion(entry: JournalEntry): number {
  return entry.indexVersion ?? (entry.indexed ? 1 : 0)
}

export function isStaleIndex(entry: JournalEntry): boolean {
  return entry.indexed && getIndexVersion(entry) < CURRENT_INDEX_VERSION
}

export function hasStructuredIndex(entry: JournalEntry): entry is JournalEntry & { insight: EntryInsight } {
  return entry.indexed && entry.insight != null && getIndexVersion(entry) >= 2
}

/**
 * True when the entry's mood is the writer's own rating. A missing source on
 * an entry that has a mood is treated as writer-rated, so nothing a person
 * set before the flag existed can ever be overwritten by the indexer.
 */
export function isWriterRated(entry: JournalEntry): boolean {
  return entry.mood != null && entry.moodSource !== 'indexer'
}

/** Quotes shorter than this are slogans ("Cannot complain"), not evidence. */
export const MIN_QUOTE_WORDS = 4

// ---------------------------------------------------------------------------
// Text folding and vocabulary routing
// ---------------------------------------------------------------------------

/** Normalise for comparison: one-space whitespace, straight quotes, lowercase. */
export function foldText(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** "my brother" → "brother"; "Sam " → "sam". Used for matching only. */
export function normalisePersonName(name: string): string {
  return foldText(name).replace(/^my\s+/, '')
}

function vocabKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

/**
 * Route a free string onto a closed vocabulary. Matches exactly after
 * key-normalisation, then ignoring underscores ("Doom scrolling" →
 * "doomscrolling"). Returns null when nothing matches.
 */
export function matchVocab(raw: string, values: readonly string[]): string | null {
  const key = vocabKey(raw)
  if (!key) return null
  if (values.includes(key)) return key
  const flat = key.replace(/_/g, '')
  return values.find((v) => v.replace(/_/g, '') === flat) ?? null
}

const VOCAB = {
  domain: DomainSchema.options,
  emotion: EmotionLabelSchema.options,
  interaction: InteractionSchema.options,
  feltAfter: FeltAfterSchema.options,
  coping: CopingStrategySchema.options,
  quoteCategory: QuoteCategorySchema.options,
  movement: MovementSchema.options,
  substance: SubstanceTypeSchema.options,
  symptom: PhysicalSymptomSchema.options,
  safety: SafetyFlagSchema.options,
  observationKind: ObservationKindSchema.options,
  observationBasis: ObservationBasisSchema.options,
  moodLabel: MoodLabelSchema.options,
} as const

function clampInt(n: number | null, min: number, max: number): number | null {
  if (n == null || Number.isNaN(n)) return null
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clampFloat(n: number | null, min: number, max: number): number | null {
  if (n == null || Number.isNaN(n)) return null
  return Math.min(max, Math.max(min, n))
}

/**
 * Apply the closed vocabularies to a tolerant LLM record. Unknown terms are
 * routed to `other` where the vocabulary has one, dropped otherwise, and the
 * raw term is appended to `unclassified` so nothing is silently lost.
 * Also normalises the seven states so every key is present, and applies the
 * numeric caps. Does not touch the entry text.
 */
export function applyVocabularies(loose: LooseEntryRecord): EntryRecord {
  const unclassified = new Set<string>(loose.unclassified.map((s) => s.trim()).filter(Boolean))
  const note = (raw: string) => { if (raw.trim()) unclassified.add(raw.trim()) }

  const domains: string[] = []
  for (const raw of loose.domains) {
    const v = matchVocab(raw, VOCAB.domain)
    if (v) { if (!domains.includes(v)) domains.push(v) } else note(raw)
  }

  const states = {} as Record<StateKey, { value: number | null; confidence: number | null; evidence: string | null }>
  for (const key of STATE_KEYS) {
    const s = loose.states[key] ?? { value: null, confidence: null, evidence: null }
    states[key] = {
      value: clampInt(s.value, 0, 10),
      confidence: clampFloat(s.confidence, 0, 1),
      evidence: s.evidence?.trim() || null,
    }
  }

  const emotions: EntryInsight['emotions'] = []
  for (const e of loose.emotions) {
    const label = matchVocab(e.label, VOCAB.emotion) as EntryInsight['emotions'][number]['label'] | null
    if (!label) { note(e.label); continue }
    if (emotions.some((x) => x.label === label)) continue
    emotions.push({ label, intensity: clampInt(e.intensity, 0, 10) ?? 5 })
  }

  const people: PersonMention[] = []
  for (const p of loose.people) {
    const name = p.name.trim()
    if (!name) continue
    const interaction = matchVocab(p.interaction, VOCAB.interaction) as PersonMention['interaction'] | null
    if (!interaction) note(p.interaction)
    let feltAfter: FeltAfter | null = null
    if (p.feltAfter) {
      const f = matchVocab(p.feltAfter, VOCAB.feltAfter) as FeltAfter | null
      if (f) feltAfter = f; else note(p.feltAfter)
    }
    people.push({ name, role: p.role.trim() || 'unknown', interaction: interaction ?? 'other', feltAfter, note: p.note.trim() })
  }

  const quotes: EntryQuote[] = []
  for (const q of loose.quotes) {
    const text = q.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const category = matchVocab(q.category, VOCAB.quoteCategory) as EntryQuote['category'] | null
    if (!category) note(q.category)
    quotes.push({ text, category: category ?? 'other', matchesRecent: q.matchesRecent?.trim() || null })
  }

  const focalEvent = loose.focalEvent && loose.focalEvent.trigger.trim()
    ? {
        trigger: loose.focalEvent.trigger.trim(),
        interpretation: loose.focalEvent.interpretation?.trim() || null,
        emotionBody: loose.focalEvent.emotionBody?.trim() || null,
        behaviour: loose.focalEvent.behaviour?.trim() || null,
        outcome: loose.focalEvent.outcome?.trim() || null,
        alternativeView: loose.focalEvent.alternativeView?.trim() || null,
      }
    : null

  const coping: EntryInsight['coping'] = []
  for (const c of loose.coping) {
    const strategy = matchVocab(c.strategy, VOCAB.coping) as EntryInsight['coping'][number]['strategy'] | null
    if (!strategy) note(c.strategy)
    coping.push({ strategy: strategy ?? 'other', effect: clampInt(c.effect, -2, 2), evidence: c.evidence.trim() })
  }

  const substances: EntryInsight['body']['substances'] = []
  for (const s of loose.body.substances) {
    const type = matchVocab(s.type, VOCAB.substance) as EntryInsight['body']['substances'][number]['type'] | null
    if (!type) note(s.type)
    substances.push({ type: type ?? 'other_recreational', quantity: s.quantity?.trim() || null })
  }
  const symptoms: EntryInsight['body']['symptoms'] = []
  for (const raw of loose.body.symptoms) {
    const v = matchVocab(raw, VOCAB.symptom) as EntryInsight['body']['symptoms'][number] | null
    if (v) { if (!symptoms.includes(v)) symptoms.push(v) } else note(raw)
  }
  let movement: EntryInsight['body']['movement'] = null
  if (loose.body.movement) {
    const m = matchVocab(loose.body.movement, VOCAB.movement) as EntryInsight['body']['movement']
    if (m) movement = m; else note(loose.body.movement)
  }

  const safetyFlag = (matchVocab(loose.safety.flag, VOCAB.safety) as SafetyFlag | null) ?? 'none'
  if (!matchVocab(loose.safety.flag, VOCAB.safety)) note(loose.safety.flag)

  const observations: Observation[] = []
  for (const o of loose.observations) {
    const text = o.text.trim()
    if (!text) continue
    const kind = matchVocab(o.kind, VOCAB.observationKind) as Observation['kind'] | null
    if (!kind) note(o.kind)
    const basis = matchVocab(o.basis, VOCAB.observationBasis) as Observation['basis'] | null
    observations.push({ text, kind: kind ?? 'thinking', basis: basis ?? 'inferred' })
  }

  const moodValue = clampInt(loose.mood.value, 1, 10) ?? 5
  const moodLabel = (matchVocab(loose.mood.label, VOCAB.moodLabel) as MoodScore['label'] | null) ?? 'neutral'

  return {
    mood: { value: moodValue, label: moodLabel },
    domains: domains.slice(0, 4),
    summary: loose.summary.trim(),
    insight: {
      inferredMood: clampInt(loose.inferredMood, 1, 10) ?? moodValue,
      states,
      emotions: emotions.slice(0, 4),
      people: people.slice(0, 5),
      quotes: quotes.slice(0, 4),
      focalEvent,
      revelations: loose.revelations.map((r) => r.trim()).filter(Boolean).slice(0, 3),
      prediction: loose.prediction && loose.prediction.text.trim()
        ? { text: loose.prediction.text.trim(), targetDate: loose.prediction.targetDate?.trim() || null }
        : null,
      coping: coping.slice(0, 4),
      body: {
        sleepHours: clampFloat(loose.body.sleepHours, 0, 24),
        sleepQuality: clampInt(loose.body.sleepQuality, 1, 10),
        movement,
        substances,
        symptoms,
        notes: loose.body.notes?.trim() || null,
      },
      safety: { flag: safetyFlag, evidence: loose.safety.evidence?.trim() || null },
      observations: observations.slice(0, 3),
      unclassified: [...unclassified],
    },
  }
}

// ---------------------------------------------------------------------------
// Guards against the entry text and the hints
// ---------------------------------------------------------------------------

/** Keep only quotes that appear verbatim (after folding) in the entry. */
export function verifyQuotes(quotes: EntryQuote[], content: string): { kept: EntryQuote[]; dropped: number } {
  const folded = foldText(content)
  const kept = quotes.filter((q) => (
    q.text.split(/\s+/).filter(Boolean).length >= MIN_QUOTE_WORDS && folded.includes(foldText(q.text))
  ))
  return { kept, dropped: quotes.length - kept.length }
}

/** `matchesRecent` must name a phrase that was actually in the hint list. */
export function verifyRecentMatches(quotes: EntryQuote[], recent: RecurringQuote[]): EntryQuote[] {
  const allowed = new Set(recent.map((r) => foldText(r.text)))
  return quotes.map((q) => (
    q.matchesRecent && allowed.has(foldText(q.matchesRecent)) ? q : { ...q, matchesRecent: null }
  ))
}

/**
 * Drop people the roster may have primed: a person is kept only if their
 * name or their role phrase appears in the entry ("my brother" keeps a
 * roster-spelled "Tom (brother)").
 */
export function filterPeopleLeakage(people: PersonMention[], content: string): PersonMention[] {
  const folded = foldText(content)
  return people.filter((p) => {
    const name = normalisePersonName(p.name)
    const role = foldText(p.role)
    return (name && folded.includes(name)) || (role && role !== 'unknown' && folded.includes(role))
  })
}

/** Values below the confidence floor are not evidence: null them. */
export function nullLowConfidence(states: EntryInsight['states']): EntryInsight['states'] {
  const out = { ...states }
  for (const key of STATE_KEYS) {
    const s = out[key]
    if (s.value != null && (s.confidence == null || s.confidence < MIN_STATE_CONFIDENCE)) {
      out[key] = { ...s, value: null }
    }
  }
  return out
}

/** Full pipeline from tolerant LLM record to a verified `EntryRecord`. */
export function finaliseRecord(loose: LooseEntryRecord, content: string, hints?: IndexHints): EntryRecord {
  const record = applyVocabularies(loose)
  const { kept, dropped } = verifyQuotes(record.insight.quotes, content)
  if (dropped > 0) console.warn('[entryRecords] dropped', dropped, 'quote(s) not found verbatim in the entry')
  const quotes = verifyRecentMatches(kept, hints?.recentQuotes ?? [])
  const people = filterPeopleLeakage(record.insight.people, content)
  return {
    ...record,
    insight: {
      ...record.insight,
      quotes,
      people,
      states: nullLowConfidence(record.insight.states),
    },
  }
}

// ---------------------------------------------------------------------------
// Aggregation across entries
// ---------------------------------------------------------------------------

function byDateAsc(a: JournalEntry, b: JournalEntry): number {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

function day(iso: string): string {
  return iso.slice(0, 10)
}

export function buildPeopleRoster(entries: JournalEntry[]): PeopleRosterItem[] {
  const map = new Map<string, PeopleRosterItem & { roleCounts: Map<string, number> }>()
  for (const e of [...entries].sort(byDateAsc)) {
    if (!hasStructuredIndex(e)) continue
    for (const p of e.insight.people) {
      const key = normalisePersonName(p.name)
      if (!key) continue
      let item = map.get(key)
      if (!item) {
        item = { name: p.name.trim(), roles: [], count: 0, firstSeen: day(e.createdAt), lastSeen: day(e.createdAt), feltAfterCounts: {}, roleCounts: new Map() }
        map.set(key, item)
      }
      item.count++
      item.lastSeen = day(e.createdAt)
      const role = p.role.trim().toLowerCase()
      if (role && role !== 'unknown') item.roleCounts.set(role, (item.roleCounts.get(role) ?? 0) + 1)
      if (p.feltAfter) item.feltAfterCounts[p.feltAfter] = (item.feltAfterCounts[p.feltAfter] ?? 0) + 1
    }
  }
  return [...map.values()]
    .map(({ roleCounts, ...item }) => ({
      ...item,
      roles: [...roleCounts.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * Group quotes that repeat across entries. Two quotes belong together when
 * their folded text is identical, or when the indexer linked one to the
 * other via `matchesRecent` (which tolerates tense/pronoun drift).
 */
export function buildRecurringQuotes(entries: JournalEntry[]): RecurringQuote[] {
  interface Group extends RecurringQuote { keys: Set<string> }
  const groups: Group[] = []
  const byKey = new Map<string, Group>()

  for (const e of [...entries].sort(byDateAsc)) {
    if (!hasStructuredIndex(e)) continue
    for (const q of e.insight.quotes) {
      const key = foldText(q.text)
      let group = byKey.get(key)
      if (!group && q.matchesRecent) group = byKey.get(foldText(q.matchesRecent))
      if (!group) {
        group = { text: q.text, count: 0, firstSeen: day(e.createdAt), lastSeen: day(e.createdAt), categories: [], keys: new Set() }
        groups.push(group)
      }
      group.count++
      group.lastSeen = day(e.createdAt)
      if (!group.categories.includes(q.category)) group.categories.push(q.category)
      group.keys.add(key)
      byKey.set(key, group)
    }
  }
  return groups
    .map((g) => ({ text: g.text, count: g.count, firstSeen: g.firstSeen, lastSeen: g.lastSeen, categories: g.categories }))
    .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
}

/** The recurring-phrase hints handed to the indexer for one run. */
export function recentQuoteHints(recurring: RecurringQuote[], now = new Date(), limit = 20, windowDays = 180): RecurringQuote[] {
  const cutoff = new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10)
  return recurring.filter((r) => r.lastSeen >= cutoff).slice(0, limit)
}

export function buildIndexHints(entries: JournalEntry[], target: JournalEntry, now = new Date()): IndexHints {
  const others = entries.filter((e) => e.id !== target.id)
  return {
    roster: buildPeopleRoster(others).slice(0, 20),
    recentQuotes: recentQuoteHints(buildRecurringQuotes(others), now),
    statedMood: isWriterRated(target) ? target.mood!.value : null,
  }
}

// ---------------------------------------------------------------------------
// Corpus report — deterministic rollups the profile step reads
// ---------------------------------------------------------------------------

export interface MonthRollup {
  key: string
  entries: number
  structured: number
  /** The writer's own ratings only: the primary wellbeing metric. */
  mood: { mean: number; n: number; min: number; max: number; minDate: string; maxDate: string } | null
  /** The indexer's estimate over structured entries, for comparison. */
  inferredMood: { mean: number; n: number } | null
  states: Record<StateKey, { mean: number; n: number } | null>
  topEmotions: Array<[string, number]>
  domains: Array<[string, number]>
  people: Array<{ name: string; count: number; feltAfter: string | null }>
  coping: Array<{ strategy: string; count: number; meanEffect: number | null }>
  safety: { monitor: string[]; concern: string[] }
  predictions: number
  body: { sleepMean: number | null; sleepN: number; substances: Array<[string, number]>; symptoms: Array<[string, number]> }
}

export interface CorpusReport {
  months: MonthRollup[]
  roster: PeopleRosterItem[]
  recurring: RecurringQuote[]
  predictions: Array<{ date: string; text: string; targetDate: string | null }>
  safety: Array<{ date: string; flag: SafetyFlag; evidence: string | null }>
  legacyCount: number
  text: string
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function topCounts(counts: Map<string, number>, limit: number): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
}

export function buildCorpusReport(entries: JournalEntry[]): CorpusReport {
  const indexed = entries.filter((e) => e.indexed).sort(byDateAsc)
  const buckets = new Map<string, JournalEntry[]>()
  for (const e of indexed) {
    const key = monthKey(monthOf(e.createdAt))
    const list = buckets.get(key)
    if (list) list.push(e); else buckets.set(key, [e])
  }

  const months: MonthRollup[] = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, list]) => {
    const withMood = list.filter(isWriterRated)
    let mood: MonthRollup['mood'] = null
    if (withMood.length > 0) {
      const minE = withMood.reduce((a, b) => (b.mood!.value < a.mood!.value ? b : a))
      const maxE = withMood.reduce((a, b) => (b.mood!.value > a.mood!.value ? b : a))
      mood = {
        mean: round1(mean(withMood.map((e) => e.mood!.value))),
        n: withMood.length,
        min: minE.mood!.value, max: maxE.mood!.value,
        minDate: day(minE.createdAt), maxDate: day(maxE.createdAt),
      }
    }
    const structured = list.filter(hasStructuredIndex)
    const inferredVals = structured.map((e) => e.insight.inferredMood).filter((v): v is number => v != null)
    const inferredMood = inferredVals.length ? { mean: round1(mean(inferredVals)), n: inferredVals.length } : null
    const sleepVals = structured.map((e) => e.insight.body.sleepHours).filter((v): v is number => v != null)
    const substanceCounts = new Map<string, number>()
    const symptomCounts = new Map<string, number>()
    for (const e of structured) {
      for (const sub of e.insight.body.substances) substanceCounts.set(sub.type, (substanceCounts.get(sub.type) ?? 0) + 1)
      for (const sym of e.insight.body.symptoms) symptomCounts.set(sym, (symptomCounts.get(sym) ?? 0) + 1)
    }
    const states = {} as MonthRollup['states']
    for (const k of STATE_KEYS) {
      const vals = structured
        .map((e) => e.insight.states[k])
        .filter((s) => s.value != null && (s.confidence ?? 0) >= REPORT_STATE_CONFIDENCE)
        .map((s) => s.value as number)
      states[k] = vals.length > 0 ? { mean: round1(mean(vals)), n: vals.length } : null
    }
    const emotionCounts = new Map<string, number>()
    const domainCounts = new Map<string, number>()
    const peopleCounts = new Map<string, { count: number; felt: Map<string, number> }>()
    const copingAgg = new Map<string, { count: number; effects: number[] }>()
    const safety = { monitor: [] as string[], concern: [] as string[] }
    let predictions = 0
    for (const e of structured) {
      for (const em of e.insight.emotions) emotionCounts.set(em.label, (emotionCounts.get(em.label) ?? 0) + 1)
      for (const d of e.tags) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1)
      for (const p of e.insight.people) {
        const k = normalisePersonName(p.name)
        const item = peopleCounts.get(k) ?? { count: 0, felt: new Map() }
        item.count++
        if (p.feltAfter) item.felt.set(p.feltAfter, (item.felt.get(p.feltAfter) ?? 0) + 1)
        peopleCounts.set(k, item)
      }
      for (const c of e.insight.coping) {
        const item = copingAgg.get(c.strategy) ?? { count: 0, effects: [] }
        item.count++
        if (c.effect != null) item.effects.push(c.effect)
        copingAgg.set(c.strategy, item)
      }
      if (e.insight.safety.flag !== 'none') safety[e.insight.safety.flag].push(day(e.createdAt))
      if (e.insight.prediction) predictions++
    }
    // Names in the month use the roster's first-seen spelling where known.
    const rosterNames = new Map(buildPeopleRoster(structured).map((r) => [normalisePersonName(r.name), r.name]))
    return {
      key,
      entries: list.length,
      structured: structured.length,
      mood,
      inferredMood,
      states,
      topEmotions: topCounts(emotionCounts, 3),
      domains: topCounts(domainCounts, 4),
      people: [...peopleCounts.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([k, v]) => ({ name: rosterNames.get(k) ?? k, count: v.count, feltAfter: topCounts(v.felt, 1)[0]?.[0] ?? null })),
      coping: [...copingAgg.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([strategy, v]) => ({ strategy, count: v.count, meanEffect: v.effects.length ? round1(mean(v.effects)) : null })),
      safety,
      predictions,
      body: {
        sleepMean: sleepVals.length ? round1(mean(sleepVals)) : null,
        sleepN: sleepVals.length,
        substances: topCounts(substanceCounts, 3),
        symptoms: topCounts(symptomCounts, 3),
      },
    }
  })

  const roster = buildPeopleRoster(indexed)
  const recurring = buildRecurringQuotes(indexed).filter((r) => r.count >= 2)
  const predictions = indexed.filter(hasStructuredIndex).filter((e) => e.insight.prediction)
    .map((e) => ({ date: day(e.createdAt), text: e.insight.prediction!.text, targetDate: e.insight.prediction!.targetDate }))
  const safety = indexed.filter(hasStructuredIndex).filter((e) => e.insight.safety.flag !== 'none')
    .map((e) => ({ date: day(e.createdAt), flag: e.insight.safety.flag, evidence: e.insight.safety.evidence }))
  const legacyCount = indexed.filter((e) => !hasStructuredIndex(e)).length

  const report: CorpusReport = { months, roster, recurring, predictions, safety, legacyCount, text: '' }
  report.text = renderCorpusReport(report)
  return report
}

const STATE_SHORT: Record<StateKey, string> = {
  anxiety: 'anx', irritability: 'irr', sadness: 'sad', calm: 'calm', agency: 'agcy', connection: 'conn', meaning: 'mean',
}

function fmtState(s: { mean: number; n: number } | null): string {
  return s ? `${s.mean}` : '–'
}

export function renderCorpusReport(r: CorpusReport): string {
  const lines: string[] = []
  lines.push('# Corpus report (computed from index records, not estimated)')
  lines.push('')
  lines.push(`Entries indexed: ${r.months.reduce((s, m) => s + m.entries, 0)}` + (r.legacyCount ? ` (${r.legacyCount} legacy, summary only)` : ''))
  lines.push('')
  lines.push('## By month')
  lines.push('"writer mood" is the writer\'s own 1-10 rating (n = entries they rated): the primary wellbeing metric, which outranks every inferred value. "inferred mood" is the indexer\'s estimate. States are 0-10 means over entries with confidence ≥ 0.5; "–" means no confident evidence that month.')
  lines.push('')
  lines.push('| Month | n | writer mood mean (n, min–max) | inferred mood | ' + STATE_KEYS.map((k) => STATE_SHORT[k]).join(' | ') + ' | top emotions | domains | people (felt after) | coping (mean effect) | body | safety |')
  lines.push('|' + Array(8 + STATE_KEYS.length).fill('---').join('|') + '|')
  for (const m of r.months) {
    const mood = m.mood ? `${m.mood.mean} (n ${m.mood.n}, ${m.mood.min}–${m.mood.max})` : '–'
    const inferred = m.inferredMood ? `${m.inferredMood.mean}` : '–'
    const bodyParts: string[] = []
    if (m.body.sleepMean != null) bodyParts.push(`sleep ${m.body.sleepMean}h (n ${m.body.sleepN})`)
    for (const [t, c] of m.body.substances) bodyParts.push(`${t} ×${c}`)
    for (const [t, c] of m.body.symptoms) bodyParts.push(`${t} ×${c}`)
    const states = STATE_KEYS.map((k) => fmtState(m.states[k])).join(' | ')
    const emotions = m.topEmotions.map(([l, c]) => `${l} ${c}`).join(', ') || '–'
    const domains = m.domains.map(([d, c]) => `${d} ${c}`).join(', ') || '–'
    const people = m.people.map((p) => `${p.name} ${p.count}${p.feltAfter ? ` (${p.feltAfter})` : ''}`).join(', ') || '–'
    const coping = m.coping.map((c) => `${c.strategy} ${c.count}${c.meanEffect != null ? ` (${c.meanEffect > 0 ? '+' : ''}${c.meanEffect})` : ''}`).join(', ') || '–'
    const safetyParts: string[] = []
    if (m.safety.concern.length) safetyParts.push(`concern ×${m.safety.concern.length}`)
    if (m.safety.monitor.length) safetyParts.push(`monitor ×${m.safety.monitor.length}`)
    lines.push(`| ${m.key} | ${m.entries} | ${mood} | ${inferred} | ${states} | ${emotions} | ${domains} | ${people} | ${coping} | ${bodyParts.join(', ') || '–'} | ${safetyParts.join(', ') || '–'} |`)
  }
  if (r.roster.length) {
    lines.push('')
    lines.push('## People (whole journal)')
    for (const p of r.roster.slice(0, 25)) {
      const felt = topCounts(new Map(Object.entries(p.feltAfterCounts) as Array<[string, number]>), 3).map(([f, c]) => `${f} ${c}`).join(', ')
      lines.push(`- ${p.name}${p.roles.length ? ` (${p.roles.join('/')})` : ''}: ${p.count} entries, ${p.firstSeen} → ${p.lastSeen}${felt ? `; felt after: ${felt}` : ''}`)
    }
  }
  if (r.recurring.length) {
    lines.push('')
    lines.push('## Recurring phrases (verbatim, count ≥ 2)')
    for (const q of r.recurring.slice(0, 30)) {
      lines.push(`- "${q.text}" ×${q.count}, ${q.firstSeen} → ${q.lastSeen} [${q.categories.join(', ')}]`)
    }
  }
  if (r.predictions.length) {
    lines.push('')
    lines.push('## Predictions the writer made')
    for (const p of r.predictions.slice(-30)) {
      lines.push(`- ${p.date}: ${p.text}${p.targetDate ? ` (by ${p.targetDate})` : ''}`)
    }
  }
  if (r.safety.length) {
    lines.push('')
    lines.push('## Safety flags (never averaged away)')
    for (const s of r.safety) {
      lines.push(`- ${s.date}: ${s.flag}${s.evidence ? ` — "${s.evidence}"` : ''}`)
    }
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Rendering one record
// ---------------------------------------------------------------------------

/**
 * How much of a record to render:
 *  - `full`     every populated section (Index view, tests, debugging)
 *  - `standard` what the profile needs from a recent entry: summary, people,
 *               quotes, focal chain, realised, prediction, safety, observations
 *  - `brief`    the gist for the narrative JSON step
 *  - `digest`   one line for an older entry; the corpus report carries the rest
 */
export type RecordTier = 'brief' | 'standard' | 'full' | 'digest'

function fmtStateValue(s: { value: number | null; confidence: number | null }): string {
  return s.value != null && (s.confidence ?? 0) >= REPORT_STATE_CONFIDENCE ? String(s.value) : '–'
}

/**
 * Compact plain-text rendering of one entry's record for a prompt. Empty
 * lines are omitted. Never includes `entry.content`; the body is only
 * counted (not read) for the word count in the `full` and legacy headers.
 */
export function renderEntryRecord(entry: JournalEntry, tier: RecordTier, recurring: RecurringQuote[] = []): string {
  const date = day(entry.createdAt)
  const words = () => entry.content.split(/\s+/).filter(Boolean).length
  const lines: string[] = []

  const moodStr = entry.mood
    ? `mood ${entry.mood.value}/10 (${isWriterRated(entry) ? 'writer-rated' : 'inferred'})`
    : 'mood –'

  if (!hasStructuredIndex(entry)) {
    if (tier === 'digest') return `- ${date} · "${entry.title}" · ${moodStr} · legacy index`
    lines.push(`## ${date} · "${entry.title}" · ${moodStr} · ${words()}w`)
    lines.push(entry.summary || '(no summary)')
    lines.push('[legacy index: summary only]')
    return lines.join('\n')
  }

  const ins = entry.insight
  const domains = entry.tags.length ? ` · ${entry.tags.join(', ')}` : ''

  if (tier === 'digest') {
    const counts = new Map(recurring.map((r) => [foldText(r.text), r.count]))
    const order = ['self_judgement', 'identity', 'rule', 'prediction']
    const rank = (q: EntryQuote) => (q.matchesRecent ? -10 : 0) + (order.indexOf(q.category) === -1 ? 9 : order.indexOf(q.category))
    const pick = [...ins.quotes].sort((a, b) => rank(a) - rank(b))[0]
    const parts = [`- ${date} · "${entry.title}" · ${moodStr}${domains}`]
    if (pick) {
      const n = counts.get(foldText(pick.matchesRecent ?? pick.text))
      parts.push(`"${pick.text}"${n && n >= 2 ? ` (recurring ×${n})` : ''}`)
    }
    if (ins.safety.flag !== 'none') parts.push(`safety: ${ins.safety.flag}`)
    return parts.join(' · ')
  }

  const full = tier === 'full'
  const states = STATE_KEYS.map((k) => `${STATE_SHORT[k]} ${fmtStateValue(ins.states[k])}`).join(' ')
  lines.push(full
    ? `## ${date} · "${entry.title}" · ${moodStr} · ${states}${domains} · ${words()}w`
    : `## ${date} · "${entry.title}" · ${moodStr}${domains}`)
  lines.push(entry.summary || '')

  if (tier === 'brief') {
    if (ins.revelations.length) lines.push(`Realised: ${ins.revelations.join(' | ')}`)
    if (ins.safety.flag !== 'none') lines.push(`Safety: ${ins.safety.flag}${ins.safety.evidence ? ` — "${ins.safety.evidence}"` : ''}`)
    return lines.filter(Boolean).join('\n')
  }

  if (full && ins.emotions.length) lines.push(`Emotions: ${ins.emotions.map((e) => `${e.label} ${e.intensity}`).join(', ')}`)
  if (ins.people.length) {
    lines.push('People: ' + ins.people.map((p) => {
      const rel = [p.role !== 'unknown' ? p.role : null, `${p.interaction}${p.feltAfter ? ` → ${p.feltAfter}` : ''}`].filter(Boolean).join('; ')
      return `${p.name} (${rel})${full && p.note ? ` — ${p.note}` : ''}`
    }).join(' | '))
  }
  if (ins.quotes.length) {
    const counts = new Map(recurring.map((r) => [foldText(r.text), r.count]))
    lines.push('Quotes:')
    for (const q of ins.quotes) {
      const n = q.matchesRecent ? counts.get(foldText(q.matchesRecent)) : counts.get(foldText(q.text))
      const tag = [q.category, n && n >= 2 ? `recurring ×${n}` : null].filter(Boolean).join(', ')
      lines.push(`> "${q.text}" [${tag}]`)
    }
  }
  if (ins.focalEvent) {
    const f = ins.focalEvent
    const chain = [f.trigger, f.interpretation && `"${f.interpretation}"`, f.emotionBody, f.behaviour, f.outcome ?? 'outcome unknown'].filter(Boolean).join(' → ')
    lines.push(`Focal: ${chain}${f.alternativeView ? ` (writer's alternative view: ${f.alternativeView})` : ''}`)
  }
  if (ins.revelations.length) lines.push(`Realised: ${ins.revelations.join(' | ')}`)
  if (ins.prediction) lines.push(`Predicts: ${ins.prediction.text}${ins.prediction.targetDate ? ` (by ${ins.prediction.targetDate})` : ''}`)
  if (full && ins.coping.length) {
    lines.push('Coping: ' + ins.coping.map((c) => `${c.strategy}${c.effect != null ? ` (${c.effect > 0 ? '+' : ''}${c.effect})` : ''}`).join(', '))
  }
  const body: string[] = []
  if (ins.body.sleepHours != null) body.push(`slept ${ins.body.sleepHours}h`)
  if (ins.body.sleepQuality != null) body.push(`sleep quality ${ins.body.sleepQuality}/10`)
  if (ins.body.movement) body.push(`movement ${ins.body.movement}`)
  for (const s of ins.body.substances) body.push(`${s.type}${s.quantity ? ` ${s.quantity}` : ''}`)
  if (ins.body.symptoms.length) body.push(ins.body.symptoms.join(', '))
  if (ins.body.notes) body.push(ins.body.notes)
  if (full && body.length) lines.push(`Body: ${body.join(' · ')}`)
  if (ins.safety.flag !== 'none') lines.push(`Safety: ${ins.safety.flag}${ins.safety.evidence ? ` — "${ins.safety.evidence}"` : ''}`)
  if (ins.observations.length) {
    lines.push('Observed: ' + ins.observations.map((o) => `[${o.kind}, ${o.basis}] ${o.text}`).join(' | '))
  }
  return lines.filter(Boolean).join('\n')
}

// ---------------------------------------------------------------------------
// Selecting and fitting records for the full profile
// ---------------------------------------------------------------------------

export function selectEntriesForFullProfile(
  entries: JournalEntry[],
  profile: PsychologicalProfile | null,
  mode: ProfileGenerationMode,
): { entries: JournalEntry[]; isRevision: boolean } {
  const indexed = entries.filter((e) => e.indexed).sort(byDateAsc)
  const analysed = profile?.analyzedEntryIds ?? []
  const canRevise = mode === 'incremental' && !!profile?.fullProfile && analysed.length > 0
  if (!canRevise) return { entries: indexed, isRevision: false }
  const seen = new Set(analysed)
  return { entries: indexed.filter((e) => !seen.has(e.id)), isRevision: true }
}

export interface FitOptions {
  now?: Date
  /** Entries this recent get the recent tier. */
  recentDays?: number
  /** At least this many newest entries get the recent tier regardless of age. */
  recentMin?: number
  /** Tier for recent entries: `standard` for the full profile, `brief` for the summary step. */
  recentTier?: 'standard' | 'brief'
}

/**
 * Render the records the full profile reads. Recent entries get the
 * standard tier; older ones a one-line digest, since the corpus report
 * already carries their numbers. Filled newest-first until the token budget
 * is spent; anything that does not fit is only represented by the report,
 * and the text says so.
 */
export function fitRecordsToBudget(
  entries: JournalEntry[],
  budgetTokens: number,
  recurring: RecurringQuote[] = [],
  opts: FitOptions = {},
): { text: string; included: number; standard: number; digest: number; dropped: number } {
  const now = opts.now ?? new Date()
  const recentDays = opts.recentDays ?? 90
  const recentMin = opts.recentMin ?? 60
  const recentTier: RecordTier = opts.recentTier ?? 'standard'
  const sorted = [...entries].sort(byDateAsc)
  const cutoff = new Date(now.getTime() - recentDays * 86_400_000).getTime()
  const firstRecentByCount = Math.max(0, sorted.length - recentMin)
  const rendered = sorted.map((e, i) => {
    const recent = i >= firstRecentByCount || new Date(e.createdAt).getTime() >= cutoff
    const tier: RecordTier = recent ? recentTier : 'digest'
    return { tier, text: renderEntryRecord(e, tier, recurring) }
  })
  let used = 0
  let start = rendered.length
  for (let i = rendered.length - 1; i >= 0; i--) {
    const cost = estimateTokens(rendered[i].text) + 1
    if (used + cost > budgetTokens) break
    used += cost
    start = i
  }
  const kept = rendered.slice(start)
  const dropped = start
  const standard = kept.filter((r) => r.tier !== 'digest').length
  const digest = kept.length - standard
  const parts: string[] = []
  if (dropped > 0) parts.push(`(${dropped} earlier record${dropped === 1 ? '' : 's'} omitted for length; the corpus report above still covers them)`)
  let i = 0
  while (i < kept.length) {
    if (kept[i].tier === 'digest') {
      const lines: string[] = []
      while (i < kept.length && kept[i].tier === 'digest') lines.push(kept[i++].text)
      parts.push(`Older entries (one line each; see the corpus report for their numbers):\n${lines.join('\n')}`)
    } else {
      parts.push(kept[i++].text)
    }
  }
  return { text: parts.join('\n\n'), included: kept.length, standard, digest, dropped }
}

import { describe, it, expect } from 'vitest'
import {
  applyVocabularies, verifyQuotes, verifyRecentMatches, filterPeopleLeakage, nullLowConfidence,
  buildPeopleRoster, buildRecurringQuotes, buildCorpusReport, renderEntryRecord,
  selectEntriesForFullProfile, fitRecordsToBudget,
} from '../../services/entryRecords'
import { EntryRecordCoercedSchema } from '../../schemas/journal'
import type { PsychologicalProfile } from '../../types/profile'
import { makeEntry, makeInsight } from '../fixtures/insight'

describe('applyVocabularies: routing free text onto the closed vocabularies', () => {
  it('maps near-misses onto vocabulary terms and keeps unknown terms for review', () => {
    /**
     * The indexer is a small model that will write "Doom scrolling" or
     * "gardening" even when told the closed list. Aggregation across
     * hundreds of entries only works if every record uses the same terms,
     * so near-misses must land on the canonical value and anything that
     * fits nothing must be kept verbatim in `unclassified` rather than
     * silently dropped.
     *
     * Input: a tolerant record with coping "Doom scrolling" and "gardening",
     * an unknown emotion "wistful", a bare-string domains field, and no
     * focalEvent at all.
     * Expected: coping → doomscrolling and other; "gardening" and "wistful"
     * in unclassified; emotions drops the unknown one; domains becomes
     * ['work']; focalEvent is null; every one of the seven states exists.
     */
    const loose = EntryRecordCoercedSchema.parse({
      mood: { value: '6', label: 'good' },
      inferredMood: 6,
      domains: 'work',
      summary: 'A day of small chores and a long walk.',
      states: { anxiety: { value: 2, confidence: 0.5, evidence: 'a little on edge' } },
      emotions: [{ label: 'wistful', intensity: 5 }, { label: 'calm', intensity: 6 }],
      coping: [
        { strategy: 'Doom scrolling', effect: -1, evidence: 'an hour on the phone' },
        { strategy: 'gardening', effect: 1, evidence: 'weeded the beds' },
      ],
    })
    const record = applyVocabularies(loose)

    expect(record.domains).toEqual(['work'])
    expect(record.insight.coping.map((c) => c.strategy)).toEqual(['doomscrolling', 'other'])
    expect(record.insight.emotions).toEqual([{ label: 'calm', intensity: 6 }])
    expect(record.insight.unclassified).toEqual(expect.arrayContaining(['gardening', 'wistful']))
    expect(record.insight.focalEvent).toBeNull()
    expect(Object.keys(record.insight.states).sort()).toEqual(['agency', 'anxiety', 'calm', 'connection', 'irritability', 'meaning', 'sadness'])
    expect(record.insight.states.anxiety).toEqual({ value: 2, confidence: 0.5, evidence: 'a little on edge' })
    expect(record.insight.states.meaning).toEqual({ value: null, confidence: null, evidence: null })
  })

  it('nulls a state value the indexer was not confident about', () => {
    /**
     * "Null beats guess": a value with confidence below 0.3 is not evidence
     * and must not enter any later average.
     * Input: sadness value 6 at confidence 0.2.
     * Expected: value null, confidence and evidence kept for QA.
     */
    const states = makeInsight().states
    states.sadness = { value: 6, confidence: 0.2, evidence: 'maybe a bit flat' }
    const out = nullLowConfidence(states)
    expect(out.sadness).toEqual({ value: null, confidence: 0.2, evidence: 'maybe a bit flat' })
    expect(out.anxiety.value).toBe(7)
  })
})

describe('Guards against invented evidence', () => {
  it('keeps only quotes that appear verbatim in the entry, tolerating curly quotes and spacing', () => {
    /**
     * Quotes are the only verbatim evidence the profile will ever have, so a
     * quote the model tidied up or invented must not be stored. Typographic
     * apostrophes and line breaks are not meaningful differences.
     * Input: the entry says "I don’t know\nwhat I want"; quotes are that line
     * with a straight apostrophe on one line, and a sentence not in the entry.
     * Expected: the first is kept, the fabricated one dropped (dropped = 1).
     */
    const content = 'Long day. I don’t know\nwhat I want anymore. Bed early.'
    const { kept, dropped } = verifyQuotes([
      { text: "I don't know what I want anymore", category: 'self_judgement', matchesRecent: null },
      { text: 'she deserves someone who knows what they want', category: 'prediction', matchesRecent: null },
    ], content)
    expect(kept.map((q) => q.text)).toEqual(["I don't know what I want anymore"])
    expect(dropped).toBe(1)
  })

  it('only trusts a recurring-phrase match that was actually in the hint list', () => {
    /**
     * `matchesRecent` lets the profile count how often a belief recurs. The
     * model may hallucinate a match, so it must name a phrase we supplied.
     * Input: one quote matching a supplied phrase, one naming a phrase we
     * never sent.
     * Expected: the first keeps its match, the second is reset to null.
     */
    const recent = [{ text: 'I am always behind', count: 4, firstSeen: '2025-01-01', lastSeen: '2025-03-01', categories: ['self_judgement'] }]
    const out = verifyRecentMatches([
      { text: "I'm always behind on everything", category: 'self_judgement', matchesRecent: 'I am always behind' },
      { text: 'nobody listens', category: 'rule', matchesRecent: 'nobody ever listens to me' },
    ], recent)
    expect(out[0].matchesRecent).toBe('I am always behind')
    expect(out[1].matchesRecent).toBeNull()
  })

  it('drops a roster-primed person who is not in the entry but keeps one named by role', () => {
    /**
     * The known-people list helps spelling stay consistent, but a small model
     * can list a roster name that never appears in the entry. A person is
     * kept if their name or their role phrase is on the page, so "my brother"
     * still supports a roster-spelled "Tom (brother)".
     * Input: entry mentions "my brother" and "Maya"; people are Tom (brother),
     * Maya (partner) and Dan (ex).
     * Expected: Tom and Maya kept, Dan dropped.
     */
    const content = 'Called my brother about the move. Maya was quiet at dinner.'
    const out = filterPeopleLeakage([
      { name: 'Tom', role: 'brother', interaction: 'support', feltAfter: 'valued', note: '' },
      { name: 'Maya', role: 'partner', interaction: 'routine', feltAfter: null, note: '' },
      { name: 'Dan', role: 'ex', interaction: 'avoidance', feltAfter: null, note: '' },
    ], content)
    expect(out.map((p) => p.name)).toEqual(['Tom', 'Maya'])
  })
})

describe('Aggregating records across the journal', () => {
  it('builds a people roster that merges spellings and tracks first and last seen', () => {
    /**
     * The roster is what tells the profile who dominates the journal, who
     * arrives and who disappears. Case differences are the same person.
     * Input: three entries mentioning "Maya", "maya" and "Maya" across
     * January to March, once as partner and twice as "girlfriend".
     * Expected: one roster item, count 3, first seen January, last seen
     * March, roles ordered most-frequent first.
     */
    const entries = [
      makeEntry({ createdAt: '2025-01-05T10:00:00.000Z', insight: makeInsight({ people: [{ name: 'Maya', role: 'partner', interaction: 'support', feltAfter: 'valued', note: '' }] }) }),
      makeEntry({ createdAt: '2025-02-05T10:00:00.000Z', insight: makeInsight({ people: [{ name: 'maya', role: 'girlfriend', interaction: 'conflict', feltAfter: 'depleted', note: '' }] }) }),
      makeEntry({ createdAt: '2025-03-05T10:00:00.000Z', insight: makeInsight({ people: [{ name: 'Maya', role: 'girlfriend', interaction: 'repair', feltAfter: 'valued', note: '' }] }) }),
    ]
    const roster = buildPeopleRoster(entries)
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ name: 'Maya', count: 3, firstSeen: '2025-01-05', lastSeen: '2025-03-05', roles: ['girlfriend', 'partner'] })
    expect(roster[0].feltAfterCounts).toEqual({ valued: 2, depleted: 1 })
  })

  it('counts a recurring phrase across entries, following the indexer link when wording drifts', () => {
    /**
     * "I am always behind" written three times over two months is the
     * strongest evidence of a standing belief. The third entry phrased it
     * "I'm always behind" and the indexer linked it via matchesRecent, so
     * it belongs to the same group.
     * Input: three entries; two identical quotes, one drifted with a link.
     * Expected: one group, count 3, first seen on the earliest date, last
     * seen on the latest.
     */
    const q = (text: string, matchesRecent: string | null = null) => makeInsight({ quotes: [{ text, category: 'self_judgement', matchesRecent }] })
    const entries = [
      makeEntry({ createdAt: '2025-01-10T10:00:00.000Z', insight: q('I am always behind') }),
      makeEntry({ createdAt: '2025-02-10T10:00:00.000Z', insight: q('I am always behind') }),
      makeEntry({ createdAt: '2025-03-10T10:00:00.000Z', insight: q("I'm always behind", 'I am always behind') }),
    ]
    const recurring = buildRecurringQuotes(entries)
    expect(recurring).toHaveLength(1)
    expect(recurring[0]).toMatchObject({ text: 'I am always behind', count: 3, firstSeen: '2025-01-10', lastSeen: '2025-03-10' })
  })

  it('computes monthly rollups from confident values only and never averages safety away', () => {
    /**
     * The profile cites the corpus report for trends, so its numbers must be
     * reproducible from the records: state means include only values at
     * confidence ≥ 0.5, and every safety flag is listed with its date.
     * Input: two March entries — anxiety 8 at 0.9 and anxiety 2 at 0.4 (not
     * confident) — one of them flagged "monitor"; plus a legacy entry.
     * Expected: March anxiety mean 8 with n 1; one safety row dated to the
     * flagged entry; the legacy entry counted but not in structured stats;
     * the rendered text carries the table and the safety section.
     */
    const a = makeInsight()
    a.states.anxiety = { value: 8, confidence: 0.9, evidence: 'I am terrified' }
    const b = makeInsight({ safety: { flag: 'monitor', evidence: "can't see the point of any of it" } })
    b.states.anxiety = { value: 2, confidence: 0.4, evidence: 'maybe' }
    const entries = [
      makeEntry({ createdAt: '2025-03-02T10:00:00.000Z', insight: a }),
      makeEntry({ createdAt: '2025-03-20T10:00:00.000Z', insight: b }),
      makeEntry({ createdAt: '2025-03-25T10:00:00.000Z', insight: null, indexVersion: 1, summary: 'Old entry.' }),
    ]
    const report = buildCorpusReport(entries)
    expect(report.months).toHaveLength(1)
    expect(report.months[0].key).toBe('2025-03')
    expect(report.months[0].entries).toBe(3)
    expect(report.months[0].structured).toBe(2)
    expect(report.months[0].states.anxiety).toEqual({ mean: 8, n: 1 })
    expect(report.months[0].safety.monitor).toEqual(['2025-03-20'])
    expect(report.safety).toEqual([{ date: '2025-03-20', flag: 'monitor', evidence: "can't see the point of any of it" }])
    expect(report.legacyCount).toBe(1)
    expect(report.text).toContain('| 2025-03 | 3 |')
    expect(report.text).toContain('## Safety flags')
  })
})

describe('Rendering records for the profile prompt', () => {
  it('renders a full record with every populated section and no raw entry text', () => {
    /**
     * The profile reads records instead of the journal, so the rendering
     * must carry the evidence (quotes, people, focal chain, body, observed)
     * while never leaking the entry body.
     * Input: the fixture entry.
     * Expected: header with date, stated mood and state values; Quotes,
     * People, Focal, Realised, Predicts, Coping, Body and Observed lines;
     * the entry's own sentence "Two glasses of wine" absent.
     */
    const entry = makeEntry()
    const text = renderEntryRecord(entry, 'full')
    expect(text).toContain('## 2025-03-14 · "Sunday, again" · mood 4/10 (inferred) · anx 7')
    expect(text).toContain('People: Maya (partner; conflict → depleted)')
    expect(text).toContain('> "I dont think I have ever chosen something without checking someones face first" [self_judgement]')
    expect(text).toContain('Focal: Maya found the unopened contract → "I have let her down again"')
    expect(text).toContain('Realised: I need to answer her before Friday')
    expect(text).toContain('Predicts: Friday conversation will end the relationship (by 2025-03-21)')
    expect(text).toContain('Coping: avoidance (-1)')
    expect(text).toContain('Body: slept 4h · alcohol 2 glasses · chest_tightness')
    expect(text).toContain('Observed: [coping, inferred]')
    expect(text).not.toContain('Two glasses of wine')
  })

  it('renders a brief record with only summary, realisations and safety, and marks legacy entries', () => {
    /**
     * The narrative JSON step needs the gist per entry, not the evidence;
     * legacy entries have only a summary and the profile must know that.
     * Input: the fixture entry at brief tier; a legacy entry.
     * Expected: brief has the summary and Realised but no Quotes; legacy
     * carries the "[legacy index: summary only]" marker.
     */
    const brief = renderEntryRecord(makeEntry(), 'brief')
    expect(brief).toContain('Realised:')
    expect(brief).not.toContain('Quotes:')

    const legacy = renderEntryRecord(makeEntry({ insight: null, indexVersion: 1 }), 'full')
    expect(legacy).toContain('[legacy index: summary only]')
    expect(legacy).not.toContain('People:')
  })
})

describe('Choosing what the full profile reads', () => {
  const profile = (overrides: Partial<PsychologicalProfile>): PsychologicalProfile => ({
    summary: 's', themes: [{ theme: 't', frequency: 5, description: 'd' }], cognitivePatterns: [], strengths: [], growthAreas: [],
    frameworkInsights: [], emotionalTrends: [], averageMood: 5, avgEntryLength: 100, reflectionDepth: 'Low', journalingStreak: 0,
    entriesAnalyzed: 1, updatedAt: '2025-03-01T00:00:00.000Z', fullProfile: '# Profile', analyzedEntryIds: [], ...overrides,
  })

  it('writes from scratch, revises with only new entries, or finds nothing new', () => {
    /**
     * Incremental mode is what keeps profile generation cheap as the journal
     * grows: with a prior profile only unseen entries are sent. Without one
     * (or in full mode) everything is sent. Ids are used rather than dates
     * because entries can be backdated.
     * Input: entries a, b, c (c backdated before a); a profile that has seen
     * a and b.
     * Expected: full mode → all three, not a revision; incremental → only c,
     * a revision; incremental with all three seen → empty, a revision; no
     * prior full profile → all three, not a revision.
     */
    const a = makeEntry({ id: 'a', createdAt: '2025-02-01T00:00:00.000Z' })
    const b = makeEntry({ id: 'b', createdAt: '2025-02-10T00:00:00.000Z' })
    const c = makeEntry({ id: 'c', createdAt: '2025-01-15T00:00:00.000Z' })
    const entries = [a, b, c]

    expect(selectEntriesForFullProfile(entries, profile({ analyzedEntryIds: ['a', 'b'] }), 'full'))
      .toEqual({ entries: [c, a, b], isRevision: false })
    expect(selectEntriesForFullProfile(entries, profile({ analyzedEntryIds: ['a', 'b'] }), 'incremental'))
      .toEqual({ entries: [c], isRevision: true })
    expect(selectEntriesForFullProfile(entries, profile({ analyzedEntryIds: ['a', 'b', 'c'] }), 'incremental'))
      .toEqual({ entries: [], isRevision: true })
    expect(selectEntriesForFullProfile(entries, profile({ fullProfile: null, analyzedEntryIds: ['a'] }), 'incremental'))
      .toEqual({ entries: [c, a, b], isRevision: false })
  })

  it('keeps the newest records when the budget is tight and says how many were left out', () => {
    /**
     * A first run on a large journal cannot send every record. The corpus
     * report covers all of them, so the rendered run keeps the most recent
     * records and states how many older ones it omitted.
     * Input: three records, a budget that fits roughly one of them.
     * Expected: one included, two dropped, the note first and the newest
     * record present.
     */
    const entries = [
      makeEntry({ title: 'Oldest', createdAt: '2025-01-01T00:00:00.000Z' }),
      makeEntry({ title: 'Middle', createdAt: '2025-02-01T00:00:00.000Z' }),
      makeEntry({ title: 'Newest', createdAt: '2025-03-01T00:00:00.000Z' }),
    ]
    const one = renderEntryRecord(entries[2], 'full')
    const { text, included, dropped } = fitRecordsToBudget(entries, Math.ceil(one.length / 4) + 10)
    expect(included).toBe(1)
    expect(dropped).toBe(2)
    expect(text.startsWith('(2 earlier records omitted for length')).toBe(true)
    expect(text).toContain('"Newest"')
    expect(text).not.toContain('"Oldest"')
  })
})

import type { EntryInsight, JournalEntry } from '../../types/journal'
import { CURRENT_INDEX_VERSION, STATE_KEYS } from '../../schemas/journal'

/**
 * A realistic v2 index record for one entry: the writer argued with their
 * partner Maya about a move, went quiet, and drank. Used across the
 * structured-index tests so each test reads like the same journal.
 */
export function makeInsight(overrides: Partial<EntryInsight> = {}): EntryInsight {
  const states = Object.fromEntries(
    STATE_KEYS.map((k) => [k, { value: null, confidence: null, evidence: null }]),
  ) as EntryInsight['states']
  states.anxiety = { value: 7, confidence: 0.8, evidence: 'tight chest, could not answer her' }
  states.agency = { value: 3, confidence: 0.6, evidence: 'went quiet rather than decide' }
  states.connection = { value: 3, confidence: 0.7, evidence: 'Maya hurt by the silence' }
  return {
    inferredMood: 4,
    states,
    emotions: [{ label: 'anxious', intensity: 8 }, { label: 'ashamed', intensity: 6 }],
    people: [
      { name: 'Maya', role: 'partner', interaction: 'conflict', feltAfter: 'depleted', note: 'pushed for a decision on the move' },
    ],
    quotes: [
      { text: 'I dont think I have ever chosen something without checking someones face first', category: 'self_judgement', matchesRecent: null },
    ],
    focalEvent: {
      trigger: 'Maya found the unopened contract',
      interpretation: 'I have let her down again',
      emotionBody: 'anxiety, tight chest',
      behaviour: 'went silent, reread old messages',
      outcome: null,
      alternativeView: null,
    },
    revelations: ['I need to answer her before Friday, even if the answer is no'],
    prediction: { text: 'Friday conversation will end the relationship', targetDate: '2025-03-21' },
    coping: [{ strategy: 'avoidance', effect: -1, evidence: 'went quiet' }],
    body: { sleepHours: 4, sleepQuality: null, movement: null, substances: [{ type: 'alcohol', quantity: '2 glasses' }], symptoms: ['chest_tightness'], notes: null },
    safety: { flag: 'none', evidence: null },
    observations: [
      { text: 'may withdraw into silence when pressed for a decision, as with the contract', kind: 'coping', basis: 'inferred' },
    ],
    unclassified: [],
    ...overrides,
  }
}

export function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: crypto.randomUUID(),
    title: 'Sunday, again',
    content: 'Maya found the unopened contract. I dont think I have ever chosen something without checking someones face first. Two glasses of wine, slept four hours.',
    createdAt: '2025-03-14T20:00:00.000Z',
    updatedAt: '2025-03-14T20:00:00.000Z',
    mood: { value: 4, label: 'low' },
    moodSource: 'writer',
    tags: ['relationship', 'housing'],
    summary: 'Argued with Maya about the Leeds move after she found the unopened contract; went quiet rather than answer.',
    indexed: true,
    insight: makeInsight(),
    indexVersion: CURRENT_INDEX_VERSION,
    indexModel: 'test-model',
    ...overrides,
  }
}

import { z } from 'zod'

export const MoodLabelSchema = z.enum(['low', 'mixed', 'neutral', 'good', 'great'])

export const MoodScoreSchema = z.object({
  value: z.number().int().min(1).max(10),
  label: MoodLabelSchema,
})

export const EntryMetadataSchema = z.object({
  mood: MoodScoreSchema,
  tags: z.array(z.string()).min(1).max(10),
  summary: z.string().min(1),
})

// Coercive version for parsing AI output — tries to fix common issues
export const EntryMetadataCoercedSchema = z.object({
  mood: z.object({
    value: z.coerce.number().int().min(1).max(10).catch(5),
    label: MoodLabelSchema.catch('neutral'),
  }),
  tags: z.union([
    z.array(z.string()),
    z.string().transform((s) => [s]),
  ]).pipe(z.array(z.string()).min(1).max(10)),
  summary: z.string().min(1),
})

// ---------------------------------------------------------------------------
// Structured entry index (v2)
//
// The index is an *instrument*: it measures what is on the page of one entry
// and stores a fixed-schema record that a later profile pass reads without
// ever seeing the entry again. Vocabularies are closed so records can be
// aggregated across hundreds of entries; anything that fits no vocabulary is
// kept verbatim in `unclassified` for review rather than invented.
//
// `CURRENT_INDEX_VERSION` bumps whenever the schema or the indexing prompt
// changes. Entries indexed under an older version are "stale" and can be
// re-indexed from Settings; they are never silently re-read.
// ---------------------------------------------------------------------------

export const CURRENT_INDEX_VERSION = 2

export const DomainSchema = z.enum([
  'work', 'study', 'relationship', 'family', 'friends', 'health', 'finances',
  'identity', 'creativity', 'housing', 'grief', 'conflict', 'achievement', 'leisure',
])
export const EmotionLabelSchema = z.enum([
  'anxious', 'ashamed', 'guilty', 'hopeful', 'proud', 'jealous', 'relieved', 'numb',
  'grateful', 'angry', 'curious', 'bored', 'affectionate', 'sad', 'lonely', 'calm',
  'content', 'overwhelmed', 'resentful', 'excited',
])
export const InteractionSchema = z.enum([
  'conflict', 'support', 'feedback', 'routine', 'reconnection', 'repair', 'avoidance', 'rupture', 'other',
])
export const FeltAfterSchema = z.enum([
  'regulated', 'valued', 'depleted', 'judged', 'energised', 'confused', 'neutral',
])
export const CopingStrategySchema = z.enum([
  'talking', 'exercise', 'walking', 'nature', 'music', 'creative_work', 'rest', 'sleep',
  'mindfulness', 'breathing', 'prayer', 'reading', 'planning', 'task_breakdown', 'exposure',
  'avoidance', 'isolation', 'doomscrolling', 'drinking', 'spending', 'overworking',
  'reassurance_seeking', 'other',
])
export const QuoteCategorySchema = z.enum([
  'self_judgement', 'prediction', 'rule', 'identity', 'value', 'agency', 'other_person', 'metaphor', 'other',
])
export const MovementSchema = z.enum(['none', 'light', 'moderate', 'strenuous'])
export const SubstanceTypeSchema = z.enum(['alcohol', 'cannabis', 'nicotine', 'other_recreational'])
export const PhysicalSymptomSchema = z.enum([
  'headache', 'gut', 'muscle_tension', 'fatigue', 'illness', 'heart_racing',
  'appetite_change', 'chest_tightness', 'pain_other', 'insomnia',
])
export const SafetyFlagSchema = z.enum(['none', 'monitor', 'concern'])
export const ObservationKindSchema = z.enum(['thinking', 'coping', 'relating', 'self', 'values', 'strength'])
export const ObservationBasisSchema = z.enum(['stated', 'inferred'])

export const STATE_KEYS = ['anxiety', 'irritability', 'sadness', 'calm', 'agency', 'connection', 'meaning'] as const
export const StateKeySchema = z.enum(STATE_KEYS)

/** Confidence below this means the indexer must not infer a value at all. */
export const MIN_STATE_CONFIDENCE = 0.3
/** Corpus rollups only average state values at or above this confidence. */
export const REPORT_STATE_CONFIDENCE = 0.5

export const InferredStateSchema = z.object({
  value: z.number().int().min(0).max(10).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.string().nullable(),
})

export const PersonMentionSchema = z.object({
  name: z.string().min(1),
  role: z.string(),
  interaction: InteractionSchema,
  feltAfter: FeltAfterSchema.nullable(),
  note: z.string(),
})

export const QuoteSchema = z.object({
  text: z.string().min(1),
  category: QuoteCategorySchema,
  /** The recurring phrase (as supplied in the hints) this quote repeats, or null. */
  matchesRecent: z.string().nullable(),
})

export const FocalEventSchema = z.object({
  trigger: z.string(),
  interpretation: z.string().nullable(),
  emotionBody: z.string().nullable(),
  behaviour: z.string().nullable(),
  outcome: z.string().nullable(),
  alternativeView: z.string().nullable(),
})

export const ObservationSchema = z.object({
  text: z.string().min(1),
  kind: ObservationKindSchema,
  basis: ObservationBasisSchema,
})

export const EntryInsightSchema = z.object({
  /** The indexer's own mood estimate, kept even when the writer's stated mood wins. */
  inferredMood: z.number().int().min(1).max(10).nullable(),
  states: z.record(StateKeySchema, InferredStateSchema),
  emotions: z.array(z.object({ label: EmotionLabelSchema, intensity: z.number().int().min(0).max(10) })).max(4),
  people: z.array(PersonMentionSchema).max(5),
  quotes: z.array(QuoteSchema).max(4),
  focalEvent: FocalEventSchema.nullable(),
  revelations: z.array(z.string()).max(3),
  prediction: z.object({ text: z.string(), targetDate: z.string().nullable() }).nullable(),
  coping: z.array(z.object({
    strategy: CopingStrategySchema,
    effect: z.number().int().min(-2).max(2).nullable(),
    evidence: z.string(),
  })).max(4),
  body: z.object({
    sleepHours: z.number().nullable(),
    sleepQuality: z.number().int().min(1).max(10).nullable(),
    movement: MovementSchema.nullable(),
    substances: z.array(z.object({ type: SubstanceTypeSchema, quantity: z.string().nullable() })),
    symptoms: z.array(PhysicalSymptomSchema),
    notes: z.string().nullable(),
  }),
  safety: z.object({ flag: SafetyFlagSchema, evidence: z.string().nullable() }),
  observations: z.array(ObservationSchema).max(3),
  /** Raw terms that fit no vocabulary, kept for human review. */
  unclassified: z.array(z.string()),
})

// ---------------------------------------------------------------------------
// Tolerant schema for the raw LLM response. Enum-valued fields are read as
// plain strings here and routed onto the closed vocabularies afterwards by
// `applyVocabularies` in services/entryRecords.ts (unknown terms → 'other' or
// dropped, and recorded in `unclassified`). Every optional structure falls
// back to empty/null so one malformed field never fails the whole entry.
// ---------------------------------------------------------------------------

const looseString = z.string().catch('')
const looseStringOrNull = z.string().nullable().catch(null)
const looseNumberOrNull = z.union([z.null(), z.coerce.number()]).catch(null)
const looseStringArray = z.union([
  z.array(z.string()),
  z.string().transform((s) => [s]),
]).catch([])

const LooseStateSchema = z.object({
  value: looseNumberOrNull,
  confidence: looseNumberOrNull,
  evidence: looseStringOrNull,
}).catch({ value: null, confidence: null, evidence: null })

export const EntryRecordCoercedSchema = z.object({
  mood: z.object({
    value: z.coerce.number().int().min(1).max(10).catch(5),
    label: MoodLabelSchema.catch('neutral'),
  }).catch({ value: 5, label: 'neutral' }),
  inferredMood: looseNumberOrNull,
  domains: looseStringArray,
  summary: z.string().catch(''),
  states: z.record(z.string(), LooseStateSchema).catch({}),
  emotions: z.array(z.object({
    label: looseString,
    intensity: looseNumberOrNull,
  })).catch([]),
  people: z.array(z.object({
    name: looseString,
    role: z.string().catch('unknown'),
    interaction: z.string().catch('other'),
    feltAfter: looseStringOrNull,
    note: looseString,
  })).catch([]),
  quotes: z.array(z.union([
    z.string().transform((text) => ({ text, category: 'other', matchesRecent: null as string | null })),
    z.object({
      text: looseString,
      category: z.string().catch('other'),
      matchesRecent: looseStringOrNull,
    }),
  ])).catch([]),
  focalEvent: z.object({
    trigger: looseString,
    interpretation: looseStringOrNull,
    emotionBody: looseStringOrNull,
    behaviour: looseStringOrNull,
    outcome: looseStringOrNull,
    alternativeView: looseStringOrNull,
  }).nullable().catch(null),
  revelations: looseStringArray,
  prediction: z.object({
    text: looseString,
    targetDate: looseStringOrNull,
  }).nullable().catch(null),
  coping: z.array(z.object({
    strategy: looseString,
    effect: looseNumberOrNull,
    evidence: looseString,
  })).catch([]),
  body: z.object({
    sleepHours: looseNumberOrNull,
    sleepQuality: looseNumberOrNull,
    movement: looseStringOrNull,
    substances: z.array(z.object({ type: looseString, quantity: looseStringOrNull })).catch([]),
    symptoms: looseStringArray,
    notes: looseStringOrNull,
  }).catch({ sleepHours: null, sleepQuality: null, movement: null, substances: [], symptoms: [], notes: null }),
  safety: z.object({
    flag: z.string().catch('none'),
    evidence: looseStringOrNull,
  }).catch({ flag: 'none', evidence: null }),
  observations: z.array(z.object({
    text: looseString,
    kind: z.string().catch('thinking'),
    basis: z.string().catch('inferred'),
  })).catch([]),
  unclassified: looseStringArray,
})

export type LooseEntryRecord = z.infer<typeof EntryRecordCoercedSchema>

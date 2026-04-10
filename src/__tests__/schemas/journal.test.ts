import { describe, it, expect } from 'vitest'
import { MoodScoreSchema, EntryMetadataSchema, EntryMetadataCoercedSchema } from '../../schemas/journal'

describe('MoodScoreSchema', () => {
  it('accepts a valid mood score at the low boundary', () => {
    /**
     * The mood value range is 1–10 (inclusive). This verifies the lower boundary
     * of 1 is accepted and the label "low" is a valid MoodLabel enum value.
     * Input: { value: 1, label: "low" }
     * Expected output: parsed object with value 1 and label "low"
     */
    const result = MoodScoreSchema.safeParse({ value: 1, label: 'low' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.value).toBe(1)
      expect(result.data.label).toBe('low')
    }
  })

  it('accepts a valid mood score at the high boundary', () => {
    /**
     * The mood value range is 1–10 (inclusive). This verifies the upper boundary
     * of 10 is accepted and "great" is a valid label for high scores.
     * Input: { value: 10, label: "great" }
     * Expected output: parsed object with value 10 and label "great"
     */
    const result = MoodScoreSchema.safeParse({ value: 10, label: 'great' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.value).toBe(10)
    }
  })

  it('rejects a mood value of 0 (below minimum)', () => {
    /**
     * Values below 1 are outside the clinical mood scale. The schema must reject
     * them to prevent invalid data entering the journal store or profile statistics.
     * Input: { value: 0, label: "low" }
     * Expected output: validation failure
     */
    const result = MoodScoreSchema.safeParse({ value: 0, label: 'low' })
    expect(result.success).toBe(false)
  })

  it('rejects a mood value of 11 (above maximum)', () => {
    /**
     * Values above 10 are outside the clinical mood scale. Rejects to prevent
     * inflated mood averages in computeLocalStats and profile generation.
     * Input: { value: 11, label: "great" }
     * Expected output: validation failure
     */
    const result = MoodScoreSchema.safeParse({ value: 11, label: 'great' })
    expect(result.success).toBe(false)
  })

  it('rejects a non-integer mood value', () => {
    /**
     * Mood values must be integers (whole numbers). Floats like 5.5 are not
     * valid on the 1–10 scale and should be rejected.
     * Input: { value: 5.5, label: "neutral" }
     * Expected output: validation failure
     */
    const result = MoodScoreSchema.safeParse({ value: 5.5, label: 'neutral' })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown mood label', () => {
    /**
     * MoodLabel is a strict enum: "low" | "mixed" | "neutral" | "good" | "great".
     * Any string outside this set must be rejected.
     * Input: { value: 5, label: "okay" }
     * Expected output: validation failure
     */
    const result = MoodScoreSchema.safeParse({ value: 5, label: 'okay' })
    expect(result.success).toBe(false)
  })
})

describe('EntryMetadataSchema', () => {
  it('accepts valid entry metadata', () => {
    /**
     * EntryMetadataSchema validates the structured output from the AI entry
     * indexing pipeline. This tests the happy path with all fields well-formed.
     * Input: mood score, non-empty tags, non-empty summary
     * Expected output: successful parse
     */
    const result = EntryMetadataSchema.safeParse({
      mood: { value: 7, label: 'good' },
      tags: ['work stress', 'gratitude'],
      summary: 'A productive day with some afternoon anxiety around deadlines.',
    })
    expect(result.success).toBe(true)
  })

  it('rejects metadata with an empty tags array', () => {
    /**
     * The schema enforces at least 1 tag (min(1)). An empty tags array means
     * the AI failed to extract any themes, which is a data quality issue.
     * Input: valid mood and summary, but tags: []
     * Expected output: validation failure
     */
    const result = EntryMetadataSchema.safeParse({
      mood: { value: 5, label: 'neutral' },
      tags: [],
      summary: 'Some content here.',
    })
    expect(result.success).toBe(false)
  })

  it('rejects metadata with an empty summary', () => {
    /**
     * The summary field must be at least 1 character (min(1)). An empty string
     * means the AI returned no summary, which should be treated as a parse error.
     * Input: valid mood and tags, but summary: ""
     * Expected output: validation failure
     */
    const result = EntryMetadataSchema.safeParse({
      mood: { value: 5, label: 'neutral' },
      tags: ['work'],
      summary: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('EntryMetadataCoercedSchema', () => {
  it('accepts well-formed AI output without coercion', () => {
    /**
     * The coerced schema is used to parse raw AI JSON output. This verifies
     * the happy path where the AI returns a perfectly formatted response.
     * Input: valid mood object, array of tag strings, non-empty summary
     * Expected output: successful parse with data unchanged
     */
    const result = EntryMetadataCoercedSchema.safeParse({
      mood: { value: 7, label: 'good' },
      tags: ['relationships', 'anxiety', 'work'],
      summary: 'Josh reflected on his relationship with Sarah and expressed underlying anxiety.',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mood.value).toBe(7)
      expect(result.data.tags).toHaveLength(3)
    }
  })

  it('coerces a string mood value to a number', () => {
    /**
     * AI models sometimes return numeric values as strings (e.g. "7" instead of 7).
     * The coerced schema uses z.coerce.number() to handle this gracefully so the
     * pipeline does not fail on minor AI formatting inconsistencies.
     * Input: mood.value as string "7"
     * Expected output: parsed with mood.value === 7 (number)
     */
    const result = EntryMetadataCoercedSchema.safeParse({
      mood: { value: '7', label: 'good' },
      tags: ['work'],
      summary: 'A normal day.',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mood.value).toBe(7)
    }
  })

  it('defaults an invalid mood value to 5 via .catch()', () => {
    /**
     * When the AI returns a mood value that cannot be coerced (e.g. "N/A"),
     * the .catch(5) fallback ensures the pipeline continues with a neutral
     * midpoint value rather than throwing and losing the whole entry.
     * Input: mood.value as "N/A" (unparseable)
     * Expected output: mood.value === 5
     */
    const result = EntryMetadataCoercedSchema.safeParse({
      mood: { value: 'N/A', label: 'neutral' },
      tags: ['work'],
      summary: 'A normal day.',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mood.value).toBe(5)
    }
  })

  it('defaults an invalid mood label to "neutral" via .catch()', () => {
    /**
     * When the AI returns an unrecognised label string, the .catch("neutral")
     * fallback ensures downstream code always has a valid MoodLabel, preventing
     * type errors in components that render the label.
     * Input: mood.label as "okay" (not in MoodLabel enum)
     * Expected output: mood.label === "neutral"
     */
    const result = EntryMetadataCoercedSchema.safeParse({
      mood: { value: 6, label: 'okay' },
      tags: ['work'],
      summary: 'A normal day.',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mood.label).toBe('neutral')
    }
  })

  it('wraps a single string tag into an array', () => {
    /**
     * Some AI responses return a single tag as a plain string instead of an array.
     * The z.string().transform(s => [s]) branch handles this so the pipeline
     * never crashes on this common formatting deviation.
     * Input: tags as a bare string "work stress"
     * Expected output: tags === ["work stress"]
     */
    const result = EntryMetadataCoercedSchema.safeParse({
      mood: { value: 5, label: 'neutral' },
      tags: 'work stress',
      summary: 'A tiring day.',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tags).toEqual(['work stress'])
    }
  })

  it('rejects metadata where tags resolves to an empty array', () => {
    /**
     * Even with coercion, the output pipeline still requires min(1) tag.
     * An empty array after coercion is a data quality failure.
     * Input: tags: []
     * Expected output: validation failure
     */
    const result = EntryMetadataCoercedSchema.safeParse({
      mood: { value: 5, label: 'neutral' },
      tags: [],
      summary: 'Some content.',
    })
    expect(result.success).toBe(false)
  })
})

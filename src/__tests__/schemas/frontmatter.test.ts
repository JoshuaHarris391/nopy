import { describe, it, expect } from 'vitest'
import { FrontmatterEntrySchema } from '../../schemas/frontmatter'

describe('FrontmatterEntrySchema', () => {
  it('accepts a complete valid frontmatter object', () => {
    /**
     * FrontmatterEntrySchema validates the YAML frontmatter parsed from .md files
     * on disk. This tests the happy path for an entry that was created and indexed
     * by nopy, meaning all fields are present and valid.
     * Input: all fields present with correct types
     * Expected output: successful parse with data unchanged
     */
    const result = FrontmatterEntrySchema.safeParse({
      id: 'abc-123',
      title: 'A good day',
      createdAt: '2026-04-07T09:00:00.000Z',
      updatedAt: '2026-04-07T09:30:00.000Z',
      mood: { value: 8, label: 'great' },
      tags: ['gratitude', 'work'],
      summary: 'Josh had a productive morning.',
      indexed: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe('abc-123')
      expect(result.data.indexed).toBe(true)
    }
  })

  it('parses successfully with all optional fields missing', () => {
    /**
     * All fields in FrontmatterEntrySchema are optional, which allows plain
     * markdown files imported from outside nopy (with no frontmatter) to be
     * partially validated without error. This tests that an empty object is valid.
     * Input: empty object {}
     * Expected output: successful parse with defaults applied
     */
    const result = FrontmatterEntrySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('defaults tags to an empty array when not provided', () => {
    /**
     * The tags field has a default of [] so that entries imported from plain
     * markdown files (which have no frontmatter) are given a valid empty array
     * rather than undefined. This prevents tag-rendering code from crashing.
     * Input: no tags field
     * Expected output: result.data.tags === []
     */
    const result = FrontmatterEntrySchema.safeParse({ title: 'My note' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tags).toEqual([])
    }
  })

  it('defaults indexed to false when not provided', () => {
    /**
     * New entries created outside nopy will not have the indexed field. The
     * default of false ensures they are picked up by the indexing pipeline
     * rather than being silently skipped as already-processed.
     * Input: no indexed field
     * Expected output: result.data.indexed === false
     */
    const result = FrontmatterEntrySchema.safeParse({ title: 'My note' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.indexed).toBe(false)
    }
  })

  it('accepts a null mood value', () => {
    /**
     * Entries that have not yet been processed by the AI will have mood: null.
     * The schema must accept null to represent the "not yet scored" state,
     * which is distinct from the entry having been scored but with no value.
     * Input: mood: null
     * Expected output: successful parse with mood === null
     */
    const result = FrontmatterEntrySchema.safeParse({
      title: 'Unindexed entry',
      mood: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mood).toBeNull()
    }
  })

  it('rejects an invalid mood object (value out of range)', () => {
    /**
     * Even though the mood field itself is optional, when it is present it
     * must conform to MoodScoreSchema (value 1–10). An invalid mood object
     * in frontmatter indicates file corruption and should fail validation.
     * Input: mood.value = 15 (above maximum)
     * Expected output: validation failure
     */
    const result = FrontmatterEntrySchema.safeParse({
      title: 'Bad entry',
      mood: { value: 15, label: 'great' },
    })
    expect(result.success).toBe(false)
  })
})

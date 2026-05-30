import { describe, it, expect } from 'vitest'
import { resolveContextItems, toInjectedItems } from '../../services/contextResolver'
import { SYSTEM_PROFILE_ID, SYSTEM_INDEX_ID, type ContextNote, type ContextInjection } from '../../types/context'
import type { PsychologicalProfile } from '../../types/profile'
import type { JournalEntry } from '../../types/journal'

function makeProfile(overrides: Partial<PsychologicalProfile> = {}): PsychologicalProfile {
  return {
    summary: 'A brief summary.',
    themes: [],
    cognitivePatterns: [],
    emotionalTrends: [],
    growthAreas: [],
    strengths: [],
    frameworkInsights: [],
    averageMood: 7,
    journalingStreak: 3,
    avgEntryLength: 200,
    reflectionDepth: 'Medium',
    updatedAt: new Date().toISOString(),
    entriesAnalyzed: 5,
    fullProfile: null,
    ...overrides,
  }
}

function makeNote(overrides: Partial<ContextNote> = {}): ContextNote {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), title: 'Note', content: 'Body', tags: [], createdAt: now, updatedAt: now, ...overrides }
}

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(), title: 'Entry', content: 'Content', createdAt: now, updatedAt: now,
    mood: { value: 7, label: 'good' }, tags: ['work'], summary: 'A summary.', indexed: true, ...overrides,
  }
}

describe('resolveContextItems', () => {
  it('always includes the profile and index system items', () => {
    /**
     * The two system items are first-class members of the workspace so the
     * user can toggle them like any note. They must appear even with no notes
     * and no data — just marked unavailable so the UI can dim them.
     * Input: no notes, empty injection, null profile, no entries
     * Expected output: both system items present, both available=false
     */
    const items = resolveContextItems([], {}, null, [])
    const profile = items.find((i) => i.id === SYSTEM_PROFILE_ID)
    const index = items.find((i) => i.id === SYSTEM_INDEX_ID)
    expect(profile?.available).toBe(false)
    expect(index?.available).toBe(false)
  })

  it('marks the profile item available once a profile has content', () => {
    /**
     * A system item is only injectable when it has underlying data. A profile
     * with a fullProfile document is available; the budget bar can then count
     * its tokens.
     * Input: a profile with fullProfile text
     * Expected output: profile item available=true, tokenEstimate > 0
     */
    const items = resolveContextItems([], {}, makeProfile({ fullProfile: 'Long document.' }), [])
    const profile = items.find((i) => i.id === SYSTEM_PROFILE_ID)!
    expect(profile.available).toBe(true)
    expect(profile.tokenEstimate).toBeGreaterThan(0)
  })

  it('resolves a note as an editable, available item with a token estimate', () => {
    /**
     * User notes are always available and editable, and carry a non-zero token
     * estimate computed with the same renderer the assembler uses (so the bar
     * matches the prompt).
     * Input: one note
     * Expected output: kind 'note', editable + available true, tokenEstimate > 0
     */
    const items = resolveContextItems([makeNote({ id: 'n1', title: 'T', content: 'C' })], {}, null, [])
    const r = items.find((i) => i.id === 'n1')!
    expect(r.kind).toBe('note')
    expect(r.editable).toBe(true)
    expect(r.available).toBe(true)
    expect(r.tokenEstimate).toBeGreaterThan(0)
  })

  it('sorts injected items first, in ascending order', () => {
    /**
     * The shelf shows injected items first, ordered by their `order` field. A
     * note at order 0 must sort before the profile at order 1.
     * Input: note injected order 0, profile injected order 1
     * Expected output: injected ids in [note, profile] order
     */
    const injection: Record<string, ContextInjection> = {
      [SYSTEM_PROFILE_ID]: { id: SYSTEM_PROFILE_ID, injected: true, order: 1 },
      n1: { id: 'n1', injected: true, order: 0 },
    }
    const items = resolveContextItems([makeNote({ id: 'n1' })], injection, makeProfile({ fullProfile: 'x' }), [])
    const injectedIds = items.filter((i) => i.injected).map((i) => i.id)
    expect(injectedIds).toEqual(['n1', SYSTEM_PROFILE_ID])
  })
})

describe('toInjectedItems', () => {
  it('drops injected-but-unavailable items and maps the rest in order', () => {
    /**
     * A system item can be toggled on before it has data (e.g. profile injected
     * by the default seed before one is generated). Such items must NOT reach
     * the assembler. Available items map to the slim {kind,id,title,content}
     * shape, ordered.
     * Input: profile injected (but null → unavailable) order 0; note injected order 1
     * Expected output: only the note, with its content carried through
     */
    const injection: Record<string, ContextInjection> = {
      [SYSTEM_PROFILE_ID]: { id: SYSTEM_PROFILE_ID, injected: true, order: 0 },
      n1: { id: 'n1', injected: true, order: 1 },
    }
    const resolved = resolveContextItems([makeNote({ id: 'n1', title: 'Note', content: 'body' })], injection, null, [makeEntry()])
    const injected = toInjectedItems(resolved)
    expect(injected.map((i) => i.id)).toEqual(['n1'])
    expect(injected[0]).toMatchObject({ kind: 'note', title: 'Note', content: 'body' })
  })
})

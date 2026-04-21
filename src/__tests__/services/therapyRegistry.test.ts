import { describe, it, expect } from 'vitest'
import {
  DEFAULT_THERAPY,
  THERAPIES,
  getTherapyPrompt,
  listTherapies,
  type TherapyType,
} from '../../services/prompts/therapists'

const ALL_TYPES: TherapyType[] = ['cbt', 'act']

describe('therapy agent registry', () => {
  it('returns the CBT system prompt for the cbt key', () => {
    // The live chat agent for CBT should be grounded in cognitive restructuring
    // language. We check for a well-known, stable phrase rather than pinning an
    // exact character count so the prompt text can evolve without breaking tests.
    const prompt = getTherapyPrompt('cbt')
    expect(prompt.length).toBeGreaterThan(500)
    expect(prompt).toMatch(/cognitive distortion|Thought Challenging|Cognitive Restructuring/i)
  })

  it('returns the ACT system prompt for the act key', () => {
    // ACT is philosophically distinct from CBT — its prompt must introduce the
    // workability frame or defusion concepts. Checking for these confirms the
    // wrong prompt is not returned under the ACT key.
    const prompt = getTherapyPrompt('act')
    expect(prompt.length).toBeGreaterThan(500)
    expect(prompt).toMatch(/workability|defusion|functional contextualism/i)
    expect(prompt).not.toBe(getTherapyPrompt('cbt'))
  })

  it('falls back to the default therapy prompt when the type is undefined', () => {
    // Existing users will not have `therapyType` in their persisted settings
    // until they open Settings once. getTherapyPrompt must return the default
    // (CBT) prompt in that case so chat behaviour is unchanged on upgrade.
    expect(getTherapyPrompt(undefined)).toBe(getTherapyPrompt(DEFAULT_THERAPY))
    expect(DEFAULT_THERAPY).toBe('cbt')
  })

  it('exposes a registry entry for every TherapyType with populated metadata', () => {
    // listTherapies drives the settings dropdown. Every therapy key in the
    // union must have a non-empty label, shortLabel, description, and prompt —
    // missing fields would render a broken option in the UI.
    const listed = listTherapies()
    expect(listed).toHaveLength(ALL_TYPES.length)

    for (const type of ALL_TYPES) {
      const entry = THERAPIES[type]
      expect(entry).toBeDefined()
      expect(entry.id).toBe(type)
      expect(entry.label.trim().length).toBeGreaterThan(0)
      expect(entry.shortLabel.trim().length).toBeGreaterThan(0)
      expect(entry.description.trim().length).toBeGreaterThan(0)
      expect(entry.systemPrompt.trim().length).toBeGreaterThan(500)
    }
  })

  it('prompts match their registry entries exactly', () => {
    // Guards against the helper function drifting from the registry map —
    // every prompt returned by getTherapyPrompt must be identical to the
    // THERAPIES entry, otherwise the UI label and the live prompt could
    // describe different agents.
    for (const type of ALL_TYPES) {
      const entry = THERAPIES[type]
      expect(getTherapyPrompt(type)).toBe(entry.systemPrompt)
    }
  })
})

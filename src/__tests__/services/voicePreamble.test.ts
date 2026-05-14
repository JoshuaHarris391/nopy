import { describe, it, expect } from 'vitest'
import { VOICE_PREAMBLE } from '../../services/prompts/voice'
import { FULL_PROFILE_SYSTEM } from '../../services/prompts/fullProfile'
import { PROFILE_NARRATIVE_SYSTEM } from '../../services/prompts/profileNarrative'
import { CBT_SYSTEM_PROMPT } from '../../services/prompts/therapists/cbt'
import { ACT_SYSTEM_PROMPT } from '../../services/prompts/therapists/act'
import { ENTRY_METADATA_SYSTEM } from '../../services/prompts/entryMetadata'

describe('VOICE_PREAMBLE — human-facing prompts', () => {
  it('is the prefix of every human-facing system prompt', () => {
    /**
     * The point of having a single VOICE_PREAMBLE constant is that the
     * assistant sounds the same across modes — CBT chat shouldn't feel
     * colder than ACT chat, and profile generation shouldn't suddenly
     * lapse into clinical chart language. If a refactor reorders any of
     * these prompts so the preamble comes after another section (or
     * disappears), the assistant's voice drifts silently in production.
     *
     * Locking in "preamble appears first" is the cheapest possible
     * regression guard for that drift.
     */
    expect(FULL_PROFILE_SYSTEM.startsWith(VOICE_PREAMBLE)).toBe(true)
    expect(PROFILE_NARRATIVE_SYSTEM.startsWith(VOICE_PREAMBLE)).toBe(true)
    expect(CBT_SYSTEM_PROMPT.startsWith(VOICE_PREAMBLE)).toBe(true)
    expect(ACT_SYSTEM_PROMPT.startsWith(VOICE_PREAMBLE)).toBe(true)
  })

  it('contains the warmth + professionalism guidance the rest of the codebase depends on', () => {
    /**
     * Other prompts assume the preamble has set a non-clinical tone. If
     * the preamble were watered down (e.g. "be helpful") without updating
     * those downstream prompts, output would still validate as JSON but
     * lose the warmth the product is designed around. Pin the load-bearing
     * phrases so a well-meaning rewrite has to consciously remove them.
     */
    expect(VOICE_PREAMBLE).toMatch(/warm/i)
    expect(VOICE_PREAMBLE).toMatch(/empathy|empathetic/i)
    expect(VOICE_PREAMBLE).toMatch(/professional/i)
    expect(VOICE_PREAMBLE).toMatch(/not.+clinical|never.+clinical|cold/i)
  })
})

describe('VOICE_PREAMBLE — structured-output prompts (intentionally skipped)', () => {
  it('is NOT prepended to ENTRY_METADATA_SYSTEM (JSON-only output)', () => {
    /**
     * Entry metadata is parsed by parseLLMJson and validated against a
     * Zod schema. The preamble's prose can confuse smaller local models
     * into echoing tone instructions inside the JSON, breaking parsing —
     * and even when it doesn't, the preamble's tokens are pure cost for
     * an internal pipeline call the user never reads.
     *
     * This test enforces the scope boundary deliberately drawn in
     * voice.ts: human-facing prose prompts get the preamble; structured
     * pipelines don't.
     */
    expect(ENTRY_METADATA_SYSTEM.startsWith(VOICE_PREAMBLE)).toBe(false)
    expect(ENTRY_METADATA_SYSTEM.includes(VOICE_PREAMBLE)).toBe(false)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The LLM dispatcher is mocked so these tests can assert exactly what the
 * indexer and the profile generator send, without a network. Same pattern
 * as llm.test.ts.
 */
const { sendMessageMock, sendMessageStreamingMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  sendMessageStreamingMock: vi.fn(),
}))
vi.mock('../../services/llm', () => ({
  sendMessage: sendMessageMock,
  sendMessageStreaming: sendMessageStreamingMock,
  resolveModel: vi.fn(() => 'test-lightweight-model'),
}))

import { entryToMarkdown, parseMarkdown } from '../../services/fs'
import { FrontmatterEntrySchema } from '../../schemas/frontmatter'
import { processEntry, generateFullProfile, generateProfileFromEntries, MAX_INDEX_RETRIES } from '../../services/entryProcessor'
import { buildCorpusReport } from '../../services/entryRecords'
import { FULL_PROFILE_REVISE_SYSTEM, FULL_PROFILE_SYSTEM } from '../../services/prompts/fullProfile'
import { PROFILE_NARRATIVE_SYSTEM } from '../../services/prompts/profileNarrative'
import type { LlmConfig } from '../../types/settings'
import { makeEntry, makeInsight } from '../fixtures/insight'

const config: LlmConfig = {
  provider: 'anthropic', apiKey: 'sk-test', anthropicMainModel: 'main', anthropicLightweightModel: 'light',
  localBaseUrl: '', localModel: '', localLightweightModel: '', openaiApiKey: '', openaiModel: '', openaiLightweightModel: '',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Structured index round-trips through the markdown file', () => {
  it('writes insight, indexVersion and indexModel to frontmatter and reads them back unchanged', () => {
    /**
     * The .md file is the source of truth for a journal. If a new field is
     * written but not read (or vice versa) the structured index silently
     * vanishes on the next sync. This checks the full path: entry →
     * markdown → parsed frontmatter → validated schema.
     * Input: the fixture entry with a full v2 insight.
     * Expected: the parsed, validated frontmatter has the same insight,
     * indexVersion 2 and the model id; the body is untouched.
     */
    const entry = makeEntry()
    const md = entryToMarkdown(entry)
    const { frontmatter, content } = parseMarkdown(md)
    const fm = FrontmatterEntrySchema.parse(frontmatter)

    expect(content).toBe(entry.content)
    expect(fm.indexVersion).toBe(2)
    expect(fm.indexModel).toBe('test-model')
    expect(fm.insight).toEqual(entry.insight)
    expect(fm.tags).toEqual(['relationship', 'housing'])
  })

  it('reads a legacy file (indexed, no version) as version 1 with no insight', () => {
    /**
     * Entries indexed before the structured index existed carry only
     * `indexed: true`. They must load as the legacy shape so the Settings
     * "re-index outdated" count and the profile's legacy marker are right.
     * Input: frontmatter with indexed true and no indexVersion/insight.
     * Expected: schema parse succeeds with insight undefined and no version;
     * the file writer then stamps indexVersion 1 on the next save.
     */
    const md = `---\nid: old\ntitle: Old\nindexed: true\nsummary: An old summary.\n---\n\nBody.`
    const fm = FrontmatterEntrySchema.parse(parseMarkdown(md).frontmatter)
    expect(fm.indexVersion).toBeUndefined()
    expect(fm.insight).toBeUndefined()

    const rewritten = entryToMarkdown(makeEntry({ id: 'old', insight: null, indexVersion: undefined, indexModel: null }))
    expect(parseMarkdown(rewritten).frontmatter.indexVersion).toBe(1)
  })
})

describe('Indexing one entry', () => {
  it('sends the stated mood, roster and recurring phrases with the entry, and stores a verified record', () => {
    /**
     * The hints keep records consistent across entries and are the reason
     * the writer's own mood is never overridden. They go in the user
     * message so the (long) system prompt is identical for every entry.
     * Input: an entry with mood 4; hints naming Maya (partner) and one
     * recurring phrase; the model returns a record with one real quote and
     * one fabricated quote.
     * Expected: the user message contains the three hint lines and the
     * content; the returned record keeps only the verbatim quote, maps
     * domains into place, and carries the model id.
     */
    const entry = makeEntry({ insight: null, indexed: false, indexVersion: 0 })
    sendMessageMock.mockResolvedValueOnce(JSON.stringify({
      mood: { value: 5, label: 'mixed' },
      inferredMood: 5,
      domains: ['relationship'],
      summary: 'Argued with Maya about the move.',
      states: { anxiety: { value: 7, confidence: 0.8, evidence: 'could not answer' } },
      quotes: [
        { text: 'I dont think I have ever chosen something without checking someones face first', category: 'self_judgement', matchesRecent: null },
        { text: 'nothing I do is ever enough', category: 'self_judgement', matchesRecent: null },
      ],
      people: [{ name: 'Maya', role: 'partner', interaction: 'conflict', feltAfter: 'depleted', note: 'wanted an answer' }],
      safety: { flag: 'none', evidence: null },
    }))

    return processEntry(entry, config, undefined, {
      roster: [{ name: 'Maya', roles: ['partner'], count: 3, firstSeen: '2025-01-01', lastSeen: '2025-03-01', feltAfterCounts: {} }],
      recentQuotes: [{ text: 'I am always behind', count: 4, firstSeen: '2025-01-01', lastSeen: '2025-03-01', categories: ['self_judgement'] }],
      statedMood: 4,
    }).then((record) => {
      const [, , , messages] = sendMessageMock.mock.calls[0]
      const userMessage = messages[0].content as string
      expect(userMessage).toContain('Stated mood (typed by the writer, do not override): 4')
      expect(userMessage).toContain('Known people (spelling reference only): Maya (partner)')
      expect(userMessage).toContain('Recent recurring phrases: "I am always behind" (x4)')
      expect(userMessage).toContain(entry.content)

      expect(record.domains).toEqual(['relationship'])
      expect(record.insight.quotes.map((q) => q.text)).toEqual(['I dont think I have ever chosen something without checking someones face first'])
      expect(record.insight.people[0].name).toBe('Maya')
      expect(record.indexModel).toBe('test-lightweight-model')
    })
  })
})

describe('Repairing an unusable index response', () => {
  const goodRecord = {
    mood: { value: 5, label: 'mixed' }, inferredMood: 5, domains: ['relationship'],
    summary: 'Argued with Maya about the move and went quiet rather than answer her.',
    safety: { flag: 'none', evidence: null },
  }

  it('feeds the broken output and the specific problems back to the model, then stores the repaired record', async () => {
    /**
     * A small model sometimes returns prose, truncated JSON, or a record
     * with the summary missing. Rather than skipping the entry, the indexer
     * extends the conversation with what the model said and what was wrong
     * with it, and asks for the corrected object.
     * Input: the model first returns prose, then JSON with no summary or
     * domains, then a valid record.
     * Expected: three calls; the second call's messages end with the prose
     * and a repair request naming the JSON failure; the third call's repair
     * request names the missing summary and domains; the stored record is
     * the third response.
     */
    sendMessageMock
      .mockResolvedValueOnce('Sure! Here is my analysis of the entry in prose.')
      .mockResolvedValueOnce(JSON.stringify({ mood: { value: 5, label: 'mixed' }, domains: [], summary: '' }))
      .mockResolvedValueOnce(JSON.stringify(goodRecord))

    const record = await processEntry(makeEntry({ insight: null, indexed: false, indexVersion: 0 }), config)

    expect(sendMessageMock).toHaveBeenCalledTimes(3)
    const secondMessages = sendMessageMock.mock.calls[1][3]
    expect(secondMessages).toHaveLength(3)
    expect(secondMessages[1]).toEqual({ role: 'assistant', content: 'Sure! Here is my analysis of the entry in prose.' })
    expect(secondMessages[2].content).toContain('could not be stored')
    expect(secondMessages[2].content).toMatch(/JSON/)

    const thirdMessages = sendMessageMock.mock.calls[2][3]
    expect(thirdMessages).toHaveLength(5)
    expect(thirdMessages[4].content).toContain('summary is missing')
    expect(thirdMessages[4].content).toContain('domains is empty')

    expect(record.summary).toBe(goodRecord.summary)
    expect(record.domains).toEqual(['relationship'])
  })

  it('gives up after the retry limit and leaves the entry unindexed for this run', async () => {
    /**
     * Retries are bounded so one stubborn entry cannot burn through an
     * API budget. After the first attempt plus MAX_INDEX_RETRIES repairs the
     * indexer throws; processAllEntries logs it and moves on.
     * Input: the model returns prose every time.
     * Expected: exactly 1 + MAX_INDEX_RETRIES calls, then a thrown error.
     */
    sendMessageMock.mockResolvedValue('Not JSON, never JSON.')

    await expect(processEntry(makeEntry({ insight: null, indexed: false, indexVersion: 0 }), config))
      .rejects.toThrow(/Failed to parse LLM response as JSON/)
    expect(sendMessageMock).toHaveBeenCalledTimes(1 + MAX_INDEX_RETRIES)
    expect(MAX_INDEX_RETRIES).toBe(3)
  })
})

describe('Summary profile reads records only', () => {
  it('sends the corpus report plus fitted brief records, never raw entry text', async () => {
    /**
     * The summary (dashboard) profile used to render a brief record for
     * every entry with no budget. It now gets the same treatment as the
     * full profile: brief records for the recent window, one-line digests
     * for older entries, fitted to the lightweight model's window, and no
     * journal text at all.
     * Input: two entries whose content carries a sentinel (both inside the
     * "newest 60" recent window, so both render brief); a small window that
     * still fits both.
     * Expected: lightweight role and the narrative prompt; the message has
     * the corpus report and brief records (summary and Realised, no Quotes)
     * for both entries, and no sentinel.
     */
    const sentinel = 'RAW-JOURNAL-TEXT-MUST-NOT-LEAK'
    const entries = [
      makeEntry({ title: 'Long ago', createdAt: '2020-01-01T10:00:00.000Z', content: `${sentinel} old` }),
      makeEntry({ title: 'Recent', createdAt: new Date().toISOString(), content: `${sentinel} new`, insight: makeInsight({ quotes: [] }) }),
    ]
    sendMessageStreamingMock.mockResolvedValue(JSON.stringify({
      summary: 'A summary.', themes: [{ theme: 'work', frequency: 5, description: 'd' }], cognitivePatterns: [],
      strengths: [], growthAreas: [], frameworkInsights: [], emotionalTrends: [],
    }))

    await generateProfileFromEntries(entries, config, { corpusReport: buildCorpusReport(entries), contextWindowTokens: 20_000 })

    const [, role, system, messages] = sendMessageStreamingMock.mock.calls[0]
    expect(role).toBe('lightweight')
    expect(system).toBe(PROFILE_NARRATIVE_SYSTEM)
    const sent = messages[0].content as string
    expect(sent).toContain('# Corpus report')
    expect(sent).toContain('## 2020-01-01 · "Long ago" · mood 4/10 (writer-rated)')
    expect(sent).toContain('"Recent" · mood 4/10 (writer-rated)')
    expect(sent).toContain('Realised: I need to answer her before Friday')
    expect(sent).not.toContain('Quotes:')
    expect(sent).not.toContain(sentinel)
  })
})

describe('Full profile reads records only', () => {
  it('never sends raw entry text, and revises the prior profile when one is given', async () => {
    /**
     * This is the whole point of the change: the main model gets the
     * corpus report and rendered records, not the journal. With a prior
     * profile it must use the revision prompt and include that profile.
     * Input: two entries whose content contains a sentinel phrase; a corpus
     * report; first a fresh write, then a revision with a prior profile.
     * Expected: the sentinel never appears in the sent message; the fresh
     * call uses FULL_PROFILE_SYSTEM and the corpus report; the revision
     * uses FULL_PROFILE_REVISE_SYSTEM and includes the prior profile.
     */
    const sentinel = 'RAW-JOURNAL-TEXT-MUST-NOT-LEAK'
    const entries = [
      makeEntry({ createdAt: '2025-03-01T10:00:00.000Z', content: `${sentinel} one` }),
      makeEntry({ createdAt: '2025-03-08T10:00:00.000Z', content: `${sentinel} two`, insight: makeInsight({ quotes: [] }) }),
    ]
    const corpusReport = buildCorpusReport(entries)
    sendMessageStreamingMock.mockResolvedValue('# Comprehensive Psychological Profile')

    await generateFullProfile(entries, config, { corpusReport, contextWindowTokens: 200_000 })
    const [, role, system, messages] = sendMessageStreamingMock.mock.calls[0]
    expect(role).toBe('main')
    expect(system).toBe(FULL_PROFILE_SYSTEM)
    expect(messages[0].content).toContain('# Corpus report')
    expect(messages[0].content).toContain('## 2025-03-01 · "Sunday, again"')
    expect(messages[0].content).not.toContain(sentinel)

    await generateFullProfile([entries[1]], config, { corpusReport, priorProfile: '# Previous text', contextWindowTokens: 200_000 })
    const [, , system2, messages2] = sendMessageStreamingMock.mock.calls[1]
    expect(system2).toBe(FULL_PROFILE_REVISE_SYSTEM)
    expect(messages2[0].content).toContain('# Previous profile\n\n# Previous text')
    expect(messages2[0].content).toContain('# New entry records since the previous profile (1, oldest first)')
    expect(messages2[0].content).not.toContain(sentinel)
  })
})

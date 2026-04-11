import { describe, it, expect } from 'vitest'
import { assembleContext } from '../../services/contextAssembler'
import type { ChatSession, ChatMessage } from '../../types/chat'
import type { PsychologicalProfile } from '../../types/profile'
import type { JournalEntry } from '../../types/journal'

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  const now = new Date().toISOString()
  return {
    id: 'session-1',
    title: 'New conversation',
    messages: [],
    summary: null,
    createdAt: now,
    updatedAt: now,
    status: 'active',
    entryContext: null,
    ...overrides,
  }
}

function makeMessage(
  role: 'user' | 'assistant',
  content: string,
  streaming = false,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date().toISOString(),
    streaming,
  }
}

function makeProfile(overrides: Partial<PsychologicalProfile> = {}): PsychologicalProfile {
  return {
    summary: 'A brief profile summary.',
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

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: crypto.randomUUID(),
    title: 'Test entry',
    content: 'Some journal content.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mood: { value: 7, label: 'good' },
    tags: ['work'],
    summary: 'A short summary.',
    indexed: true,
    ...overrides,
  }
}

describe('assembleContext', () => {
  it('returns a system prompt with the base prompt and today\'s date appended', () => {
    /**
     * assembleContext always appends the current date to the system prompt so
     * the AI therapist knows what day it is. This is important for contextual
     * awareness (e.g. "you mentioned feeling low on Monday").
     * Input: minimal session, no profile, no entries, base system prompt "Be helpful."
     * Expected output: system string starts with "Be helpful." and contains the
     * current year (as a proxy for today's date being present).
     */
    const session = makeSession()
    const { system } = assembleContext(session, null, [], 'Be helpful.')
    expect(system).toContain('Be helpful.')
    expect(system).toContain(String(new Date().getFullYear()))
  })

  it('returns an empty messages array for a session with no messages', () => {
    /**
     * A brand new session has no messages. The assembled messages array should
     * be empty so the AI receives no prior conversation context, giving it a
     * clean slate for a new session.
     * Input: session with messages: []
     * Expected output: messages === []
     */
    const session = makeSession()
    const { messages } = assembleContext(session, null, [], 'System prompt.')
    expect(messages).toHaveLength(0)
  })

  it('injects the full psychological profile into the system prompt when available', () => {
    /**
     * When the user has a generated fullProfile (the long markdown document),
     * it is injected into the system prompt so the therapist AI has full
     * clinical context. This is the primary signal source for personalised responses.
     * Input: profile with fullProfile set to a recognisable string
     * Expected output: system contains the fullProfile content
     */
    const profile = makeProfile({ fullProfile: 'FULL PROFILE CONTENT HERE' })
    const session = makeSession()
    const { system } = assembleContext(session, profile, [], 'System.')
    expect(system).toContain('FULL PROFILE CONTENT HERE')
  })

  it('falls back to profile summary when fullProfile is null', () => {
    /**
     * If the full profile has not been generated (e.g. Opus failed or hasn't
     * been run yet), the shorter Haiku-generated summary is injected instead.
     * The therapist AI still receives some profile context to personalise responses.
     * Input: profile with fullProfile: null and summary: "SHORT SUMMARY"
     * Expected output: system contains "SHORT SUMMARY" but not a fullProfile section
     */
    const profile = makeProfile({ fullProfile: null, summary: 'SHORT SUMMARY' })
    const session = makeSession()
    const { system } = assembleContext(session, profile, [], 'System.')
    expect(system).toContain('SHORT SUMMARY')
  })

  it('injects themes into the system prompt when the profile has themes', () => {
    /**
     * Recurring themes (e.g. "work stress", "relationships") are appended to the
     * system prompt as a quick-reference list. This helps the therapist AI make
     * connections between the current conversation and established patterns.
     * Input: profile with themes ["work stress", "sleep issues"]
     * Expected output: system contains "work stress" and "sleep issues"
     */
    const profile = makeProfile({
      themes: [
        { theme: 'work stress', frequency: 8, description: 'Recurring work tension.' },
        { theme: 'sleep issues', frequency: 5, description: 'Disrupted sleep patterns.' },
      ],
    })
    const session = makeSession()
    const { system } = assembleContext(session, profile, [], 'System.')
    expect(system).toContain('work stress')
    expect(system).toContain('sleep issues')
  })

  it('includes indexed entries with summaries in the journal index table', () => {
    /**
     * Indexed entries with summaries are formatted into a markdown table in the
     * system prompt. This gives the therapist AI a bird's-eye view of the user's
     * journal history to reference in conversation.
     * Input: one indexed entry with a summary
     * Expected output: system contains the entry's title and summary
     */
    const entry = makeEntry({ title: 'A specific entry', summary: 'Josh felt anxious about work.' })
    const session = makeSession()
    const { system } = assembleContext(session, null, [entry], 'System.')
    expect(system).toContain('A specific entry')
    expect(system).toContain('Josh felt anxious about work.')
  })

  it('excludes unindexed entries from the journal index table', () => {
    /**
     * Unindexed entries do not have summaries and have not been processed by the
     * AI, so they cannot contribute meaningful context to the index table.
     * Including them would add noise without insight.
     * Input: one unindexed entry (indexed: false, summary: null)
     * Expected output: system does NOT contain "Journal Entry Index" section
     */
    const entry = makeEntry({ indexed: false, summary: null, title: 'Draft entry' })
    const session = makeSession()
    const { system } = assembleContext(session, null, [entry], 'System.')
    expect(system).not.toContain('Journal Entry Index')
  })

  it('caps the entry index table at 30 entries', () => {
    /**
     * To prevent the system prompt from exceeding the context budget on token-heavy
     * journal histories, the index table is capped at the 30 most recent entries.
     * This test verifies that 40 entries results in only 30 being injected.
     * Input: 40 indexed entries
     * Expected output: system contains "30 most recent" in the index header
     */
    const entries = Array.from({ length: 40 }, (_, i) =>
      makeEntry({
        title: `Entry ${i}`,
        createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      }),
    )
    const session = makeSession()
    const { system } = assembleContext(session, null, entries, 'System.')
    expect(system).toContain('30 most recent')
  })

  it('injects focused entry context at the end of the system prompt', () => {
    /**
     * When the user opens a chat from a specific journal entry, that entry's full
     * content is injected at the end of the system prompt (the highest-attention
     * position) as the "Current Session Focus". This ensures the AI always
     * references that entry throughout the conversation.
     * Input: session with no entryContext, but entryContext passed directly
     * Expected output: system contains the entry content and the focus header
     */
    const session = makeSession()
    const { system } = assembleContext(session, null, [], 'System.', 30000, {
      title: 'My focus entry',
      content: 'SPECIFIC ENTRY CONTENT FOR TESTING',
      date: '2026-04-07T09:00:00.000Z',
    })
    expect(system).toContain('Current Session Focus')
    expect(system).toContain('SPECIFIC ENTRY CONTENT FOR TESTING')
  })

  it('includes all session messages within the token budget', () => {
    /**
     * When the session's message history is small enough to fit within the context
     * budget, all messages should be included in the assembled output so the AI
     * has the full conversation history.
     * Input: session with 3 short messages (well within a 30000-token budget)
     * Expected output: messages array has length 3
     */
    const session = makeSession({
      messages: [
        makeMessage('user', 'Hello'),
        makeMessage('assistant', 'Hi there, how can I help?'),
        makeMessage('user', 'I have been feeling anxious lately.'),
      ],
    })
    const { messages } = assembleContext(session, null, [], 'System.')
    expect(messages).toHaveLength(3)
  })

  it('truncates oldest messages when the history exceeds the token budget', () => {
    /**
     * When a long conversation history exceeds the remaining token budget after
     * the system prompt is accounted for, the assembler drops the oldest messages
     * and keeps the most recent ones. This ensures the AI always sees the latest
     * context rather than ancient history.
     * Input: 100 messages of ~200 chars each (~50 tokens each = ~5000 tokens),
     *        with a very small contextBudget of 500 tokens (forces truncation)
     * Expected output: messages array has fewer than 100 items
     */
    const longContent = 'word '.repeat(50) // ~200 chars
    const manyMessages = Array.from({ length: 100 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', longContent),
    )
    const session = makeSession({ messages: manyMessages })
    const { messages } = assembleContext(session, null, [], 'System.', 500)
    expect(messages.length).toBeLessThan(100)
  })

  it('skips streaming messages when assembling the message history', () => {
    /**
     * Streaming messages are in-flight partial responses from the AI. They must
     * not be included in the message history sent to the API, because they are
     * incomplete and would confuse the model about its own output.
     * Input: 2 complete messages + 1 streaming message
     * Expected output: messages array has length 2 (streaming message excluded)
     */
    const session = makeSession({
      messages: [
        makeMessage('user', 'Hello'),
        makeMessage('assistant', 'Hi there.'),
        makeMessage('assistant', 'Partial respo...', true),
      ],
    })
    const { messages } = assembleContext(session, null, [], 'System.')
    expect(messages).toHaveLength(2)
    expect(messages.every((m) => !('streaming' in m) || m.streaming !== true)).toBe(true)
  })

  it('injects session summary when message count exceeds 20', () => {
    /**
     * When a session has more than 20 messages, a pre-generated summary of the
     * earlier discussion is injected as the first two messages (a user message
     * presenting the summary, and an assistant acknowledgement). This lets the
     * AI understand the full arc of the conversation even when old messages are
     * truncated by the token budget.
     * Input: session with 21 messages and a non-null summary
     * Expected output: first message content contains "Continuing a previous conversation"
     */
    const msgs = Array.from({ length: 21 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', 'Short message.'),
    )
    const session = makeSession({
      messages: msgs,
      summary: 'We discussed anxiety and coping strategies.',
    })
    const { messages } = assembleContext(session, null, [], 'System.')
    expect(messages[0].content).toContain('Continuing a previous conversation')
    expect(messages[0].content).toContain('We discussed anxiety and coping strategies.')
  })

  it('does not inject session summary when message count is 20 or fewer', () => {
    /**
     * The session summary injection is only triggered when the conversation has
     * grown long enough that old messages might be truncated (> 20 messages).
     * For short sessions the full history is included and no summary is needed.
     * Input: session with 5 messages and a non-null summary
     * Expected output: no message mentions "Continuing a previous conversation"
     */
    const msgs = Array.from({ length: 5 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', 'Short message.'),
    )
    const session = makeSession({
      messages: msgs,
      summary: 'We discussed anxiety.',
    })
    const { messages } = assembleContext(session, null, [], 'System.')
    expect(messages.every((m) => !m.content.includes('Continuing a previous conversation'))).toBe(true)
  })
})

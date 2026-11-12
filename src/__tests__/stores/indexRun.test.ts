import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * In-memory mock of idb-keyval so store writes do not hit IndexedDB (absent
 * in jsdom).
 */
const idbStore = new Map<unknown, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: unknown) => idbStore.get(key)),
  set: vi.fn(async (key: unknown, value: unknown) => {
    idbStore.set(key, value)
  }),
  del: vi.fn(async (key: unknown) => {
    idbStore.delete(key)
  }),
}))

/**
 * In-memory journal folder. The store reaches the Tauri fs plugin through a
 * dynamic import, so vi.mock intercepts it; the tests then read `mockFs.files`
 * to see exactly what would be on disk.
 */
const mockFs = {
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  reset() {
    this.files.clear()
    this.dirs.clear()
  },
}
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(async (path: string, contents: string) => {
    mockFs.files.set(path, contents)
  }),
  readTextFile: vi.fn(async (path: string) => mockFs.files.get(path) ?? ''),
  readDir: vi.fn(async (dir: string) =>
    [...mockFs.files.keys()]
      .filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
      .map((p) => ({ name: p.slice(dir.length + 1) }))),
  exists: vi.fn(async (path: string) => mockFs.files.has(path) || mockFs.dirs.has(path)),
  mkdir: vi.fn(async (path: string) => {
    mockFs.dirs.add(path)
  }),
  remove: vi.fn(async (path: string) => {
    mockFs.files.delete(path)
  }),
}))

/**
 * Only the Anthropic SDK is mocked, at its network edge. Everything between
 * the store and the SDK (the dispatcher, the provider client, the indexer,
 * the markdown writer) is the real code, because the bug these tests pin was
 * in how those layers hand a response to each other.
 */
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock, stream: vi.fn() }
    models = { list: vi.fn(async () => ({ data: [] })) }
  },
}))

import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore, selectLlmConfig } from '../../stores/settingsStore'
import { MAX_INDEX_RETRIES } from '../../services/entryProcessor'
import { resetOutputCaps, FALLBACK_OUTPUT_CAP } from '../../services/llm'
import { makeEntry } from '../fixtures/insight'
import type { JournalEntry } from '../../types/journal'

const JOURNAL = '/tmp/index-run-journal'

/** A never-indexed entry already saved to its own markdown file. */
function unindexed(id: string, title: string, day: string): JournalEntry {
  return makeEntry({
    id, title,
    content: `${title}: a long day, and I am still thinking about it.`,
    createdAt: `2026-03-${day}T09:00:00.000Z`,
    updatedAt: `2026-03-${day}T09:00:00.000Z`,
    mood: null, moodSource: null, tags: [], summary: null,
    indexed: false, insight: null, indexVersion: 0, indexModel: null,
    sourceFilename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`,
  })
}

/** The index record a model returns for one entry, as the JSON text it would write. */
function recordJson(summary: string): string {
  return JSON.stringify({
    mood: { value: 6, label: 'good' },
    inferredMood: 6,
    domains: ['work'],
    summary,
    safety: { flag: 'none', evidence: null },
  })
}

/**
 * What Claude Haiku 5.5 sends back: thinking is on by default, so the answer
 * is the second content block, after a thinking block whose text is empty.
 */
function thinkingThenText(text: string) {
  return {
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text },
    ],
    stop_reason: 'end_turn',
  }
}

/** The text of the entry the indexer is asking about, taken from the request. */
function askedAbout(request: unknown): string {
  const messages = (request as { messages: { content: string }[] }).messages
  return messages[0].content
}

/**
 * The provider's reply when the output cap asked for is more than the model
 * can produce: Anthropic's wording for a model limited to `limit` tokens.
 */
function capRejection(asked: number, limit: number): Error {
  return Object.assign(
    new Error(`max_tokens: ${asked} > ${limit}, which is the maximum allowed number of output tokens for claude-small`),
    { status: 400 },
  )
}

const askedFor = (request: unknown) => (request as { max_tokens: number }).max_tokens

const fileOf = (name: string) => mockFs.files.get(`${JOURNAL}/${name}`) ?? ''
const entryById = (id: string) => useJournalStore.getState().entries.find((e) => e.id === id)!
const noProgress = () => {}

beforeEach(() => {
  idbStore.clear()
  mockFs.reset()
  mockFs.dirs.add(JOURNAL)
  vi.clearAllMocks()
  resetOutputCaps()
  // hasFileSystem() checks for this on the window object.
  ;(globalThis as unknown as { window: { __TAURI_INTERNALS__?: object } }).window.__TAURI_INTERNALS__ = {}
  useSettingsStore.setState({
    provider: 'anthropic', apiKey: 'sk-test', anthropicLightweightModel: 'claude-small', privateMode: false, journalPath: JOURNAL,
  })
  useJournalStore.setState({ entries: [], loaded: true, lastError: null })
})

afterEach(() => {
  delete (globalThis as unknown as { window: { __TAURI_INTERNALS__?: object } }).window.__TAURI_INTERNALS__
})

describe('An indexing run saves what the model returned', () => {
  it('indexes every entry and writes the record to its markdown file when the model thinks before answering', async () => {
    /**
     * Newer Claude models think by default, so a reply is a thinking block
     * followed by the text. The app used to read only the first block, got
     * an empty string for every entry, and finished the run having saved
     * nothing: no summary in the Index, nothing in the markdown files, and
     * no error.
     * Input: two unindexed entries; the model answers each with a thinking
     * block and then a valid record.
     * Expected: both entries are indexed with the model's summary, the run
     * reports 2 indexed and none failed, and each markdown file's
     * frontmatter carries the summary and the structured record.
     */
    useJournalStore.setState({ entries: [unindexed('a', 'Monday', '02'), unindexed('b', 'Tuesday', '03')] })
    createMock.mockImplementation(async (request: unknown) => (
      thinkingThenText(recordJson(askedAbout(request).includes('Monday')
        ? 'Monday was spent catching up on the quarterly report.'
        : 'Tuesday brought a difficult conversation with the team lead.'))
    ))

    const config = selectLlmConfig(useSettingsStore.getState())
    const run = await useJournalStore.getState().processEntries(config, 'unindexed', noProgress)

    expect(run).toMatchObject({ attempted: 2, indexed: 2, failed: [] })
    expect(entryById('a').indexed).toBe(true)
    expect(entryById('a').summary).toBe('Monday was spent catching up on the quarterly report.')
    expect(entryById('b').summary).toBe('Tuesday brought a difficult conversation with the team lead.')
    expect(fileOf('monday.md')).toContain('summary: Monday was spent catching up on the quarterly report.')
    expect(fileOf('monday.md')).toContain('insight:')
    expect(fileOf('tuesday.md')).toContain('indexed: true')
  })

  it('saves the entries that worked and reports the one that did not, with the reason', async () => {
    /**
     * One entry the model cannot index must not cost the rest of the run,
     * and the writer has to be told which entry failed and why; a failure
     * used to be visible only in the developer console.
     * Input: three unindexed entries; the model returns prose instead of
     * JSON for Tuesday every time it is asked, and a valid record for the
     * other two.
     * Expected: Monday and Wednesday are indexed and written to disk;
     * Tuesday stays unindexed; the run reports 2 indexed and names Tuesday
     * as failed with a reason that mentions JSON.
     */
    useJournalStore.setState({
      entries: [unindexed('a', 'Monday', '02'), unindexed('b', 'Tuesday', '03'), unindexed('c', 'Wednesday', '04')],
    })
    createMock.mockImplementation(async (request: unknown) => (
      askedAbout(request).includes('Tuesday')
        ? thinkingThenText('I would rather describe this entry in prose.')
        : thinkingThenText(recordJson('A steady day of work with nothing left unfinished.'))
    ))

    const config = selectLlmConfig(useSettingsStore.getState())
    const run = await useJournalStore.getState().processEntries(config, 'unindexed', noProgress)

    expect(run.attempted).toBe(3)
    expect(run.indexed).toBe(2)
    expect(run.failed).toHaveLength(1)
    expect(run.failed[0]).toMatchObject({ id: 'b', title: 'Tuesday' })
    expect(run.failed[0].reason).toMatch(/JSON/)
    expect(entryById('b').indexed).toBe(false)
    expect(fileOf('monday.md')).toContain('indexed: true')
    expect(fileOf('wednesday.md')).toContain('indexed: true')
    // Tuesday was asked once, then repaired up to the retry limit.
    expect(createMock).toHaveBeenCalledTimes(2 + 1 + MAX_INDEX_RETRIES)
  })

  it('stops at once on an invalid API key and says so, instead of reporting nothing to do', async () => {
    /**
     * A problem with the provider (bad key, no connection, rate limit) will
     * fail every entry the same way. The run used to grind through the whole
     * journal, swallow each error, and then say "Already up to date".
     * Input: three unindexed entries; the provider rejects the key (401).
     * Expected: the run rejects with the API-key message after a single
     * request, and no entry is marked indexed.
     */
    useJournalStore.setState({
      entries: [unindexed('a', 'Monday', '02'), unindexed('b', 'Tuesday', '03'), unindexed('c', 'Wednesday', '04')],
    })
    createMock.mockRejectedValue(Object.assign(new Error('invalid x-api-key'), { status: 401 }))

    const config = selectLlmConfig(useSettingsStore.getState())
    await expect(useJournalStore.getState().processEntries(config, 'unindexed', noProgress))
      .rejects.toThrow(/API key/)

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(useJournalStore.getState().entries.every((e) => !e.indexed)).toBe(true)
  })

  it('has already saved the finished entries when the run is stopped part-way', async () => {
    /**
     * Indexing a long journal takes minutes. Records used to be held in
     * memory until the last entry finished, so stopping the run, or quitting
     * the app, threw away everything done so far. Each entry is now saved
     * the moment its record comes back.
     * Input: two unindexed entries; the writer presses Stop while the second
     * request is in flight.
     * Expected: by the time the second request is made, Monday's file
     * already holds its record; the run ends without an error and reports 1
     * indexed.
     */
    useJournalStore.setState({ entries: [unindexed('a', 'Monday', '02'), unindexed('b', 'Tuesday', '03')] })
    const controller = new AbortController()
    let mondayFileDuringSecondRequest = ''
    createMock
      .mockImplementationOnce(async () => thinkingThenText(recordJson('Monday was spent catching up on the quarterly report.')))
      .mockImplementationOnce(async () => {
        mondayFileDuringSecondRequest = fileOf('monday.md')
        controller.abort()
        throw new Error('Request was aborted.')
      })

    const config = selectLlmConfig(useSettingsStore.getState())
    const run = await useJournalStore.getState().processEntries(config, 'unindexed', noProgress, controller.signal)

    expect(mondayFileDuringSecondRequest).toContain('summary: Monday was spent catching up on the quarterly report.')
    expect(run.indexed).toBe(1)
    expect(run.failed).toEqual([])
    expect(entryById('b').indexed).toBe(false)
  })

  it('writes the record to an imported file that sync renamed', async () => {
    /**
     * A file dropped into the journal folder is renamed to the app's own
     * naming scheme the first time it is synced ("My Day.md" becomes
     * "my-day.md"). The store kept the old name, so the next save looked
     * like one entry overwriting another's file, was refused, and the
     * refusal was only logged: the entry looked indexed until the journal
     * was reopened, and its file never got the record.
     * Input: a plain "My Day.md" with no frontmatter; sync from disk; index.
     * Expected: the entry tracks "my-day.md", and that file's frontmatter
     * holds the summary.
     */
    mockFs.files.set(`${JOURNAL}/My Day.md`, 'Walked to the harbour and thought about the move.')
    createMock.mockImplementation(async () => thinkingThenText(recordJson('A walk to the harbour, turning the move over.')))

    await useJournalStore.getState().syncFromDisk()
    const config = selectLlmConfig(useSettingsStore.getState())
    const run = await useJournalStore.getState().processEntries(config, 'unindexed', noProgress)

    expect(run).toMatchObject({ indexed: 1, failed: [] })
    expect(useJournalStore.getState().entries[0].sourceFilename).toBe('my-day.md')
    expect(fileOf('my-day.md')).toContain('summary: A walk to the harbour, turning the move over.')
    expect(mockFs.files.has(`${JOURNAL}/My Day.md`)).toBe(false)
  })
})

describe('A lightweight model with a small output limit', () => {
  it('is retried at a lower cap once, then indexes the whole run at that cap', async () => {
    /**
     * Indexing asks for a generous output cap so models that think have
     * room. Older and smaller models cannot output that much and reject the
     * request outright. Rather than fail, the request is retried at 4,096
     * tokens, which those models accept, and the lower cap is remembered so
     * the rejection is paid for once, not once per entry.
     * Input: three unindexed entries; a model that rejects any cap above
     * 4,096 and otherwise answers normally.
     * Expected: all three entries are indexed; the provider saw one rejected
     * request at the full cap and three at the fallback cap.
     */
    useJournalStore.setState({
      entries: [unindexed('a', 'Monday', '02'), unindexed('b', 'Tuesday', '03'), unindexed('c', 'Wednesday', '04')],
    })
    createMock.mockImplementation(async (request: unknown) => {
      if (askedFor(request) > 4096) throw capRejection(askedFor(request), 4096)
      return { content: [{ type: 'text', text: recordJson('A steady day of work with nothing left unfinished.') }], stop_reason: 'end_turn' }
    })

    const config = selectLlmConfig(useSettingsStore.getState())
    const run = await useJournalStore.getState().processEntries(config, 'unindexed', noProgress)

    expect(run).toMatchObject({ attempted: 3, indexed: 3, failed: [] })
    const caps = createMock.mock.calls.map(([request]) => askedFor(request))
    expect(caps.filter((cap) => cap > FALLBACK_OUTPUT_CAP)).toHaveLength(1)
    expect(caps.filter((cap) => cap === FALLBACK_OUTPUT_CAP)).toHaveLength(3)
  })

  it('stops the run and says to choose a different model when even the lower cap is refused', async () => {
    /**
     * A model whose limit is below the fallback cannot index anything, and
     * every entry would fail the same way. The writer needs one clear
     * message: which model, that its output limit is the problem, and that
     * the fix is to pick another model. The provider's own words are
     * included because they carry the actual limit.
     * Input: three unindexed entries; a model limited to 2,048 output tokens.
     * Expected: the run rejects after two requests (the full cap, then the
     * fallback) with a message naming the model, the refused limit, the
     * provider's message, and the recommendation; nothing is indexed.
     */
    useJournalStore.setState({
      entries: [unindexed('a', 'Monday', '02'), unindexed('b', 'Tuesday', '03'), unindexed('c', 'Wednesday', '04')],
    })
    createMock.mockImplementation(async (request: unknown) => {
      throw capRejection(askedFor(request), 2048)
    })

    const config = selectLlmConfig(useSettingsStore.getState())
    const failure = await useJournalStore.getState().processEntries(config, 'unindexed', noProgress).catch((e: Error) => e)

    expect(failure).toBeInstanceOf(Error)
    const message = (failure as Error).message
    expect(message).toContain('"claude-small"')
    expect(message).toContain('4,096 tokens')
    expect(message).toContain('Choose a different model in Settings')
    expect(message).toContain('max_tokens: 4096 > 2048')
    expect(createMock).toHaveBeenCalledTimes(2)
    expect(useJournalStore.getState().entries.every((e) => !e.indexed)).toBe(true)
  })

  it('names the limit when the lower cap is accepted but too small for the record', async () => {
    /**
     * The fallback cap can be accepted and still not be enough: the model
     * runs out of output part-way through the record. That must not read as
     * a generic failure. The reason shown against the entry says what the
     * model's limit is and recommends a model with a larger one.
     * Input: two unindexed entries; a model that rejects caps above 4,096
     * and, at 4,096, stops on max_tokens before finishing.
     * Expected: both entries are reported as failed, with a reason naming
     * the model, the 4,096-token limit, and a model with a larger limit.
     */
    useJournalStore.setState({ entries: [unindexed('a', 'Monday', '02'), unindexed('b', 'Tuesday', '03')] })
    createMock.mockImplementation(async (request: unknown) => {
      if (askedFor(request) > 4096) throw capRejection(askedFor(request), 4096)
      return { content: [{ type: 'text', text: '{"summary": "Monday was sp' }], stop_reason: 'max_tokens' }
    })

    const config = selectLlmConfig(useSettingsStore.getState())
    const run = await useJournalStore.getState().processEntries(config, 'unindexed', noProgress)

    expect(run.indexed).toBe(0)
    expect(run.failed).toHaveLength(2)
    expect(run.failed[0].reason).toContain('"claude-small" allows at most 4,096 output tokens')
    expect(run.failed[0].reason).toContain('Choose a model with a larger output limit')
  })
})

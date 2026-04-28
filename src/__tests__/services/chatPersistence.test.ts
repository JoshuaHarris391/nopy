import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ChatSession, ChatMessage } from '../../types/chat'

/**
 * In-memory mock of @tauri-apps/plugin-fs. The chat persistence module reaches
 * for these functions via dynamic import, so vi.mock intercepts them at module
 * resolution time. Each test gets a fresh map via beforeEach to avoid bleed.
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
  readTextFile: vi.fn(async (path: string) => {
    if (!mockFs.files.has(path)) throw new Error(`ENOENT: ${path}`)
    return mockFs.files.get(path)!
  }),
  exists: vi.fn(async (path: string) => {
    return mockFs.files.has(path) || mockFs.dirs.has(path)
  }),
  mkdir: vi.fn(async (path: string) => {
    mockFs.dirs.add(path)
  }),
  remove: vi.fn(async (path: string) => {
    mockFs.files.delete(path)
  }),
}))

import * as fsPlugin from '@tauri-apps/plugin-fs'
import {
  saveChatToDisk,
  loadChatFromDisk,
  scheduleChatSave,
  flushChatSave,
} from '../../services/chatPersistence'

const JOURNAL = '/tmp/test-journal'
const NDJSON_PATH = `${JOURNAL}/chat.ndjson`
const LEGACY_PATH = `${JOURNAL}/chat.json`

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: 'hello',
    timestamp: '2026-04-13T10:00:00.000Z',
    ...overrides,
  }
}

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: 'Test session',
    messages: [makeMessage()],
    summary: null,
    createdAt: '2026-04-13T10:00:00.000Z',
    updatedAt: '2026-04-13T10:00:00.000Z',
    status: 'active',
    entryContext: null,
    entryContextRef: null,
    ...overrides,
  }
}

beforeEach(() => {
  mockFs.reset()
  mockFs.dirs.add(JOURNAL)
  vi.clearAllMocks()
  // hasFileSystem() checks for this on the window object.
  ;(globalThis as unknown as { window: { __TAURI_INTERNALS__?: object } }).window.__TAURI_INTERNALS__ = {}
})

afterEach(() => {
  vi.useRealTimers()
  delete (globalThis as unknown as { window: { __TAURI_INTERNALS__?: object } }).window.__TAURI_INTERNALS__
})

describe('saveChatToDisk', () => {
  it('writes one JSON object per line with a trailing newline', async () => {
    /**
     * NDJSON's defining property: each line is a complete, independent JSON
     * object, terminated by '\n'. This test verifies the writer produces that
     * shape — N sessions yields N lines, each parses on its own, and there is
     * no top-level envelope (no `version`, `updatedAt`, or `sessions` wrapper)
     * because IndexedDB is the runtime source of truth and those fields were
     * never read by the loader.
     *
     * Input: array of two sessions
     * Expected output: file contains exactly two lines, each is a session JSON,
     * neither contains envelope keys, file ends with '\n'.
     */
    const s1 = makeSession({ id: 'sess-1', title: 'first' })
    const s2 = makeSession({ id: 'sess-2', title: 'second' })

    await saveChatToDisk([s1, s2], JOURNAL)

    const text = mockFs.files.get(NDJSON_PATH)!
    expect(text.endsWith('\n')).toBe(true)

    const lines = text.split('\n').filter((l) => l.length > 0)
    expect(lines).toHaveLength(2)

    const parsed1 = JSON.parse(lines[0])
    const parsed2 = JSON.parse(lines[1])
    expect(parsed1.id).toBe('sess-1')
    expect(parsed2.id).toBe('sess-2')
    for (const obj of [parsed1, parsed2]) {
      expect(obj).not.toHaveProperty('version')
      expect(obj).not.toHaveProperty('sessions')
    }
  })

  it('writes a zero-byte file when sessions array is empty', async () => {
    /**
     * If the user deletes their last chat session, the next save must write
     * an empty file — not skip the write entirely. Skipping would leave the
     * old NDJSON on disk, and on next startup the deleted sessions would be
     * silently restored from disk, undoing the user's delete.
     *
     * Input: empty sessions array
     * Expected output: file exists at chat.ndjson with content ''.
     */
    await saveChatToDisk([], JOURNAL)
    expect(mockFs.files.get(NDJSON_PATH)).toBe('')
  })

  it('drops entryContext and streaming flags via stripForDisk', async () => {
    /**
     * The runtime ChatSession holds two transient fields that must NOT be
     * persisted: `entryContext` (the full markdown body of a journal entry,
     * already on disk as a .md file) and `streaming` on individual messages
     * (a UI flag indicating an in-flight LLM response). Persisting either
     * would bloat the file and create stale duplicates. `stripForDisk`
     * removes them; this test pins that contract at the disk-format boundary.
     *
     * Input: session with entryContext set and one streaming message
     * Expected output: written line has no `entryContext` value and no
     * message has a `streaming` flag.
     */
    const session = makeSession({
      entryContext: { title: 'Today', content: 'long body...', date: '2026-04-13' },
      entryContextRef: '2026-04-13.md',
      messages: [
        makeMessage({ role: 'user', content: 'hi' }),
        makeMessage({ role: 'assistant', content: 'streaming...', streaming: true }),
      ],
    })

    await saveChatToDisk([session], JOURNAL)

    const line = mockFs.files.get(NDJSON_PATH)!.trim()
    const parsed = JSON.parse(line) as Record<string, unknown> & {
      messages: Array<Record<string, unknown>>
    }

    // entryContext is stripped (becomes undefined and is not serialized)
    expect(parsed.entryContext).toBeUndefined()
    // entryContextRef survives — the loader needs it to lazy-hydrate on first send
    expect(parsed.entryContextRef).toBe('2026-04-13.md')
    for (const msg of parsed.messages) {
      expect(msg).not.toHaveProperty('streaming')
    }
  })

  it('creates the journal directory if it does not exist', async () => {
    /**
     * On first launch with a brand-new journal directory, saveChatToDisk
     * must create the directory before writing into it. Otherwise the
     * underlying writeTextFile call fails with ENOENT.
     *
     * Input: journal path that does not yet exist on disk
     * Expected output: mkdir is called with `recursive: true` before
     * writeTextFile is invoked.
     */
    mockFs.dirs.delete(JOURNAL)
    const order: string[] = []
    vi.mocked(fsPlugin.mkdir).mockImplementationOnce(async (p) => {
      order.push(`mkdir:${String(p)}`)
      mockFs.dirs.add(String(p))
    })
    vi.mocked(fsPlugin.writeTextFile).mockImplementationOnce(async (p, c) => {
      order.push(`write:${String(p)}`)
      mockFs.files.set(String(p), String(c))
    })

    await saveChatToDisk([makeSession()], JOURNAL)

    expect(order).toEqual([`mkdir:${JOURNAL}`, `write:${NDJSON_PATH}`])
    expect(vi.mocked(fsPlugin.mkdir)).toHaveBeenCalledWith(JOURNAL, { recursive: true })
  })
})

describe('loadChatFromDisk', () => {
  it('round-trips sessions through save and load', async () => {
    /**
     * The most important invariant: anything we save must come back identical
     * (modulo the transient fields that stripForDisk drops). Without this,
     * journal switching, IndexedDB recovery, and cross-machine portability
     * are all broken.
     *
     * Input: two sessions with messages, summary, status, entryContextRef
     * Expected output: loadChatFromDisk returns the same two sessions,
     * preserving id, title, messages, summary, createdAt, updatedAt, status,
     * and entryContextRef.
     */
    const s1 = makeSession({
      id: 'sess-1',
      title: 'one',
      summary: 'a summary',
      status: 'archived',
      entryContextRef: '2026-04-01.md',
    })
    const s2 = makeSession({
      id: 'sess-2',
      title: 'two',
      messages: [
        makeMessage({ role: 'user', content: 'q' }),
        makeMessage({ role: 'assistant', content: 'a' }),
      ],
    })

    await saveChatToDisk([s1, s2], JOURNAL)
    const loaded = await loadChatFromDisk(JOURNAL)

    expect(loaded).toHaveLength(2)
    expect(loaded[0].id).toBe('sess-1')
    expect(loaded[0].title).toBe('one')
    expect(loaded[0].summary).toBe('a summary')
    expect(loaded[0].status).toBe('archived')
    expect(loaded[0].entryContextRef).toBe('2026-04-01.md')
    expect(loaded[1].id).toBe('sess-2')
    expect(loaded[1].messages).toHaveLength(2)
    expect(loaded[1].messages[0].content).toBe('q')
    expect(loaded[1].messages[1].content).toBe('a')
  })

  it('loads an empty file as an empty array', async () => {
    /**
     * Per the save semantics, deleting the last session writes a zero-byte
     * file. The loader must round-trip that to an empty sessions array — not
     * throw, not log an error, not return null. This is the path users hit
     * when they clear their history and restart.
     *
     * Input: chat.ndjson exists with content ''
     * Expected output: loadChatFromDisk returns []
     */
    mockFs.files.set(NDJSON_PATH, '')
    const loaded = await loadChatFromDisk(JOURNAL)
    expect(loaded).toEqual([])
  })

  it('skips malformed lines and loads the valid ones', async () => {
    /**
     * The whole point of NDJSON over a single JSON envelope: a corrupt line
     * does not lose every other session. If the file has 100 sessions and
     * one line gets truncated by a crash mid-write, the other 99 must still
     * load. This is the user-visible reliability win of the migration.
     *
     * Input: file with [valid, garbage, valid] lines
     * Expected output: loadChatFromDisk returns the two valid sessions and
     * emits a console.warn for the malformed line.
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const valid1 = JSON.stringify({ ...makeSession({ id: 'good-1' }) })
    const valid2 = JSON.stringify({ ...makeSession({ id: 'good-2' }) })
    mockFs.files.set(NDJSON_PATH, `${valid1}\n{not valid json\n${valid2}\n`)

    const loaded = await loadChatFromDisk(JOURNAL)
    expect(loaded.map((s) => s.id)).toEqual(['good-1', 'good-2'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns an empty array when journal path is empty', async () => {
    /**
     * Before a journal is selected, callers may invoke loadChatFromDisk with
     * an empty string. The function must short-circuit to [] without invoking
     * any filesystem APIs — otherwise we'd see ENOENT errors logged on every
     * fresh launch before the user picks a directory.
     *
     * Input: journalPath = ''
     * Expected output: returns []; no fs call is made.
     */
    const loaded = await loadChatFromDisk('')
    expect(loaded).toEqual([])
    expect(vi.mocked(fsPlugin.exists)).not.toHaveBeenCalled()
    expect(vi.mocked(fsPlugin.readTextFile)).not.toHaveBeenCalled()
  })
})

describe('legacy chat.json migration', () => {
  it('migrates an old chat.json into chat.ndjson and deletes the old file', async () => {
    /**
     * Users upgrading from the previous version have a `chat.json` envelope
     * file in their journal. On first load after upgrade, we must transparently
     * read it, write the equivalent NDJSON, and delete the old file so the
     * journal folder ends up clean. This is a one-shot, on-load migration —
     * saves never write the legacy format.
     *
     * Input: legacy chat.json with {version, updatedAt, sessions: [s1, s2]}
     * Expected output: loadChatFromDisk returns [s1, s2]; chat.ndjson now
     * contains two NDJSON lines; legacy chat.json no longer exists.
     */
    const s1 = makeSession({ id: 'old-1', title: 'old one' })
    const s2 = makeSession({ id: 'old-2', title: 'old two' })
    const legacy = JSON.stringify({
      version: 1,
      updatedAt: '2026-04-13T10:00:00.000Z',
      sessions: [s1, s2],
    })
    mockFs.files.set(LEGACY_PATH, legacy)

    const loaded = await loadChatFromDisk(JOURNAL)

    expect(loaded.map((s) => s.id)).toEqual(['old-1', 'old-2'])
    expect(mockFs.files.has(LEGACY_PATH)).toBe(false)
    const newText = mockFs.files.get(NDJSON_PATH)!
    const lines = newText.split('\n').filter((l) => l.length > 0)
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).id).toBe('old-1')
    expect(JSON.parse(lines[1]).id).toBe('old-2')
  })

  it('prefers chat.ndjson and leaves chat.json untouched when both exist', async () => {
    /**
     * If a user manually copies an old chat.json back into a journal that
     * already has a chat.ndjson, do NOT delete the legacy file — it could be
     * an intentional restore-from-backup. Defensive choice: read the new
     * file, leave the old one, log a warning so the user can investigate.
     *
     * Input: both chat.ndjson (sessions: [new]) and chat.json (sessions: [old])
     * Expected output: loadChatFromDisk returns [new]; chat.json is still
     * present afterwards; a console.warn is emitted.
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const newer = makeSession({ id: 'from-ndjson' })
    const older = makeSession({ id: 'from-legacy' })
    mockFs.files.set(NDJSON_PATH, JSON.stringify(newer) + '\n')
    mockFs.files.set(
      LEGACY_PATH,
      JSON.stringify({ version: 1, updatedAt: 'x', sessions: [older] }),
    )

    const loaded = await loadChatFromDisk(JOURNAL)

    expect(loaded.map((s) => s.id)).toEqual(['from-ndjson'])
    expect(mockFs.files.has(LEGACY_PATH)).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('scheduleChatSave / flushChatSave', () => {
  it('debounces rapid scheduleChatSave calls into a single write', async () => {
    /**
     * The user typing in chat triggers many state mutations per second
     * (addMessage, finalizeStreamingMessage, updateSessionTitle, etc.). Each
     * mutation calls scheduleChatSave. The 2-second debounce collapses the
     * burst into one disk write — without this, we'd hammer the disk on
     * every keystroke. The test pins the collapse behavior and confirms the
     * LAST scheduled payload wins.
     *
     * Input: three scheduleChatSave calls in quick succession with three
     * different sessions; advance fake timers by 2 seconds.
     * Expected output: writeTextFile called exactly once; its payload
     * contains the third (last-scheduled) session.
     */
    vi.useFakeTimers()
    scheduleChatSave([makeSession({ id: 'first' })], JOURNAL)
    scheduleChatSave([makeSession({ id: 'second' })], JOURNAL)
    scheduleChatSave([makeSession({ id: 'third' })], JOURNAL)

    expect(vi.mocked(fsPlugin.writeTextFile)).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)

    expect(vi.mocked(fsPlugin.writeTextFile)).toHaveBeenCalledTimes(1)
    const written = mockFs.files.get(NDJSON_PATH)!
    expect(written).toContain('"id":"third"')
    expect(written).not.toContain('"id":"first"')
    expect(written).not.toContain('"id":"second"')
  })

  it('flushChatSave persists pending writes immediately without waiting for the debounce', async () => {
    /**
     * Journal switching cannot wait for the 2-second debounce. If the user
     * picks a new journal folder, any pending in-memory chat changes must be
     * flushed to the OLD journal first, then the store is cleared and the
     * new journal is loaded. flushChatSave is the synchronous escape hatch
     * that callers (e.g. DataPrivacySection) use to force the write.
     *
     * Input: schedule a save; immediately call flushChatSave without
     * advancing timers.
     * Expected output: writeTextFile is called; the file content reflects
     * the scheduled session.
     */
    vi.useFakeTimers()
    scheduleChatSave([makeSession({ id: 'pending' })], JOURNAL)
    expect(vi.mocked(fsPlugin.writeTextFile)).not.toHaveBeenCalled()

    await flushChatSave()

    expect(vi.mocked(fsPlugin.writeTextFile)).toHaveBeenCalledTimes(1)
    expect(mockFs.files.get(NDJSON_PATH)).toContain('"id":"pending"')
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { JournalEntry } from '../../types/journal'

/**
 * In-memory mock of @tauri-apps/plugin-fs. saveEntryToDisk reaches for these
 * functions via dynamic import, so vi.mock intercepts them at module-resolution
 * time. The factory closes over `mockFs`, which is initialised before the first
 * import of the mocked module, so the lazy closure sees a ready map.
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
  exists: vi.fn(async (path: string) => mockFs.files.has(path) || mockFs.dirs.has(path)),
  mkdir: vi.fn(async (path: string) => {
    mockFs.dirs.add(path)
  }),
  remove: vi.fn(async (path: string) => {
    mockFs.files.delete(path)
  }),
}))

import { saveEntryToDisk, entryToMarkdown } from '../../services/fs'

const JOURNAL = '/tmp/test-journal'

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'test-id',
    title: 'My Test Entry',
    content: 'body',
    createdAt: '2026-06-29T09:00:00.000Z',
    updatedAt: '2026-06-29T09:30:00.000Z',
    mood: null,
    tags: [],
    summary: null,
    indexed: false,
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
  delete (globalThis as unknown as { window: { __TAURI_INTERNALS__?: object } }).window.__TAURI_INTERNALS__
})

describe('saveEntryToDisk filename-collision protection', () => {
  it('does NOT overwrite an existing entry when a brand-new entry has the same title', async () => {
    /**
     * The core data-loss bug. New entries default their title to today's date,
     * so creating a second entry on the same day produces the same slugified
     * filename (e.g. "2026-06-29.md"). Without a guard the second entry's save
     * silently overwrites the first entry's file and its content is lost forever.
     *
     * Setup: entry A already lives on disk at 2026-06-29.md with its content.
     * Action: save a DIFFERENT new entry B (no sourceFilename) whose title
     *   slugifies to the same "2026-06-29.md".
     * Expected: the save rejects with a FilenameExistsError AND A's file on disk
     *   is left untouched (still A's content, never B's).
     */
    const entryA = makeEntry({
      id: 'entry-a',
      title: '2026-06-29',
      content: 'A: first entry of the day — do not lose me',
      sourceFilename: '2026-06-29.md',
    })
    const filePath = `${JOURNAL}/2026-06-29.md`
    mockFs.files.set(filePath, entryToMarkdown(entryA))

    const entryB = makeEntry({
      id: 'entry-b',
      title: '2026-06-29',
      content: 'B: second entry — must not clobber A',
      sourceFilename: undefined,
    })

    const err = await saveEntryToDisk(entryB, JOURNAL).catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect((err as Error).name).toBe('FilenameExistsError')

    const onDisk = mockFs.files.get(filePath)!
    expect(onDisk).toContain('A: first entry of the day — do not lose me')
    expect(onDisk).not.toContain('B: second entry')
  })

  it('does NOT overwrite or delete files when an existing entry is renamed onto another entry\'s name', async () => {
    /**
     * The rename variant of the same bug — just as destructive. The autosave path
     * (updateEntry) deletes the old file and writes the new slug. So if the user
     * accidentally renames entry B to entry A's title, the naive path would both
     * clobber A's file (overwrite) AND remove B's old file — two entries lost.
     *
     * Setup: entry A at vacation.md, entry B at work.md (both already on disk).
     * Action: rename B's title to "Vacation" — saveEntryToDisk(B, journal, 'work.md'),
     *   whose new slug is "vacation.md".
     * Expected: rejects with FilenameExistsError, A's vacation.md still holds A's
     *   content, AND B's work.md still exists with B's content (the old file was
     *   never removed because the guard throws before the rename cleanup).
     */
    const entryA = makeEntry({
      id: 'entry-a',
      title: 'Vacation',
      content: 'A: the original vacation entry',
      sourceFilename: 'vacation.md',
    })
    const entryB = makeEntry({
      id: 'entry-b',
      title: 'Work',
      content: 'B: keep me, I am the work entry',
      sourceFilename: 'work.md',
    })
    mockFs.files.set(`${JOURNAL}/vacation.md`, entryToMarkdown(entryA))
    mockFs.files.set(`${JOURNAL}/work.md`, entryToMarkdown(entryB))

    // User renames B to "Vacation"; updateEntry would call save with the old filename.
    const renamedB = { ...entryB, title: 'Vacation' }
    const err = await saveEntryToDisk(renamedB, JOURNAL, 'work.md').catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect((err as Error).name).toBe('FilenameExistsError')

    // A's file untouched.
    expect(mockFs.files.get(`${JOURNAL}/vacation.md`)).toContain('A: the original vacation entry')
    // B's own file not deleted by a premature rename-cleanup.
    expect(mockFs.files.has(`${JOURNAL}/work.md`)).toBe(true)
    expect(mockFs.files.get(`${JOURNAL}/work.md`)).toContain('B: keep me, I am the work entry')
  })

  it('re-saves an entry to its own existing file without error (no false positive)', async () => {
    /**
     * The guard must only fire on a DIFFERENT entry's file. Re-saving the same
     * entry — its slug already matches its own sourceFilename — is the normal
     * autosave case and must overwrite its own file freely, otherwise every edit
     * after the first would be blocked.
     *
     * Setup: 2026-06-29.md exists holding the entry's previous body.
     * Action: save the same entry (sourceFilename "2026-06-29.md") with new body.
     * Expected: resolves, returns "2026-06-29.md", and the file now holds the new body.
     */
    const entry = makeEntry({
      id: 'entry-a',
      title: '2026-06-29',
      content: 'updated body text',
      sourceFilename: '2026-06-29.md',
    })
    mockFs.files.set(`${JOURNAL}/2026-06-29.md`, '---\nold\n---\n\nold body')

    const result = await saveEntryToDisk(entry, JOURNAL, '2026-06-29.md')

    expect(result).toBe('2026-06-29.md')
    expect(mockFs.files.get(`${JOURNAL}/2026-06-29.md`)).toContain('updated body text')
  })

  it('writes a new file when the title slug is unique', async () => {
    /**
     * The happy path for a genuinely new entry: a title that does not collide
     * with anything on disk should write a fresh file named after its slug.
     *
     * Setup: empty journal folder.
     * Action: save a new entry titled "Vacation".
     * Expected: resolves, returns "vacation.md", and that file now exists.
     */
    const entry = makeEntry({ id: 'new-entry', title: 'Vacation', content: 'a fresh entry' })

    const result = await saveEntryToDisk(entry, JOURNAL)

    expect(result).toBe('vacation.md')
    expect(mockFs.files.get(`${JOURNAL}/vacation.md`)).toContain('a fresh entry')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'

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

/** Disk is simulated: the loader returns whatever the test says is on disk. */
const { loadMock, saveMock } = vi.hoisted(() => ({
  loadMock: vi.fn(async () => [] as unknown[]),
  saveMock: vi.fn(async () => 'x.md'),
}))
vi.mock('../../services/fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/fs')>()),
  hasFileSystem: () => true,
  loadEntriesFromDisk: loadMock,
  saveEntryToDisk: saveMock,
  deleteEntryFromDisk: vi.fn(async () => {}),
}))

import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { makeEntry } from '../fixtures/insight'

beforeEach(() => {
  idbStore.clear()
  vi.clearAllMocks()
  useSettingsStore.setState({ journalPath: '/journal' })
  useJournalStore.setState({ entries: [], loaded: true, lastError: null })
})

describe('Sync from disk: two files with the same entry id', () => {
  it('loads the entry once, keeps the newer file, and names both files in the error bar', async () => {
    /**
     * A copied file, or a rename that left its old file behind, gives two
     * markdown files the same frontmatter id. Loading both made the entry
     * appear twice, and every re-index then added another copy while the
     * older file was never rewritten. The sync now keeps one per id and
     * tells the writer which files clash.
     *
     * Input: disk has 2026-03-19_afternoon.md (legacy, older) and
     * 2026-03-19-afternoon.md (v2, newer) with the same id, plus an
     * unrelated entry.
     * Expected: two entries in the store, the shared id present once and
     * carrying the newer file's record; lastError names both filenames; no
     * write-back for the clashing id.
     */
    const older = makeEntry({ id: 'same', title: '2026-03-19_afternoon', sourceFilename: '2026-03-19_afternoon.md', updatedAt: '2026-03-19T10:00:00.000Z', insight: null, indexVersion: 1 })
    const newer = makeEntry({ id: 'same', title: '2026-03-19_afternoon', sourceFilename: '2026-03-19-afternoon.md', updatedAt: '2026-09-17T10:00:00.000Z' })
    const other = makeEntry({ id: 'other', sourceFilename: 'other.md' })
    loadMock.mockResolvedValueOnce([older, newer, other])

    await useJournalStore.getState().syncFromDisk()

    const entries = useJournalStore.getState().entries
    expect(entries).toHaveLength(2)
    const kept = entries.find((e) => e.id === 'same')!
    expect(kept.sourceFilename).toBe('2026-03-19-afternoon.md')
    expect(kept.indexVersion).toBe(2)
    expect(useJournalStore.getState().lastError).toContain('2026-03-19_afternoon.md and 2026-03-19-afternoon.md')
    // Write-back only runs for genuinely new, non-clashing entries.
    expect((saveMock.mock.calls as unknown[][]).map((c) => (c[0] as { id: string }).id)).toEqual(['other'])
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'

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
 * The entry processor is where journal text is handed to the LLM. Mocking it
 * lets the tests assert "was the LLM path entered at all?" without a network.
 * vi.hoisted is needed because vi.mock factories run before top-level consts.
 */
const { processAllEntriesMock, processEntryMock, profileNarrativeMock, fullProfileMock } = vi.hoisted(() => ({
  processAllEntriesMock: vi.fn(async () => new Map()),
  processEntryMock: vi.fn(async () => ({ mood: { value: 3, label: 'neutral' }, tags: [], summary: '' })),
  profileNarrativeMock: vi.fn(),
  fullProfileMock: vi.fn(),
}))
vi.mock('../../services/entryProcessor', () => ({
  processAllEntries: processAllEntriesMock,
  processEntry: processEntryMock,
  generateProfileFromEntries: profileNarrativeMock,
  generateFullProfile: fullProfileMock,
  computeLocalStats: vi.fn(() => ({})),
}))

import { useJournalStore } from '../../stores/journalStore'
import { useProfileStore } from '../../stores/profileStore'
import { useSettingsStore, selectLlmConfig } from '../../stores/settingsStore'
import type { JournalEntry } from '../../types/journal'

const entry: JournalEntry = {
  id: 'e1', title: 'Monday', content: 'Some words about the day.',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  mood: null, tags: [], summary: null, indexed: false,
}

beforeEach(() => {
  idbStore.clear()
  vi.clearAllMocks()
  useSettingsStore.setState({ privateMode: false, apiKey: 'sk-test', provider: 'anthropic', journalPath: '' })
  useJournalStore.setState({ entries: [entry], loaded: true, lastError: null })
  useProfileStore.setState({ profile: null, loaded: true, generating: false })
})

describe('Private mode blocks the LLM at the store level', () => {
  it('indexing and profile generation are no-ops while private mode is on', async () => {
    /**
     * The UI hides every Index / Generate button in private mode, but the
     * promise to the user is stronger: nothing reaches an AI provider. So the
     * store actions themselves refuse to run, which also covers any future
     * call site that forgets to check.
     *
     * Input: private mode on; call processEntries, reindexEntry and
     * generateProfile with a fully configured provider.
     * Expected: processEntries resolves 0, the entry stays unindexed, the
     * profile store never enters its generating state, and the entry
     * processor is never called.
     */
    useSettingsStore.setState({ privateMode: true })
    const config = selectLlmConfig(useSettingsStore.getState())
    const noProgress = () => {}

    const count = await useJournalStore.getState().processEntries(config, true, noProgress)
    await useJournalStore.getState().reindexEntry('e1', config)
    await useProfileStore.getState().generateProfile([entry], config)

    expect(count).toBe(0)
    expect(useJournalStore.getState().entries[0].indexed).toBe(false)
    expect(useProfileStore.getState().generating).toBe(false)
    expect(useProfileStore.getState().profile).toBeNull()
    expect(processAllEntriesMock).not.toHaveBeenCalled()
    expect(processEntryMock).not.toHaveBeenCalled()
    expect(profileNarrativeMock).not.toHaveBeenCalled()
  })

  it('the same calls reach the entry processor once private mode is off', async () => {
    /**
     * Proves the guard is the only thing holding the calls back — otherwise
     * the test above could pass because indexing was broken for some other
     * reason.
     *
     * Input: private mode off; call processEntries and reindexEntry.
     * Expected: processAllEntries called once, processEntry called once with
     * the entry, and the entry is marked indexed.
     */
    const config = selectLlmConfig(useSettingsStore.getState())

    await useJournalStore.getState().processEntries(config, true, () => {})
    await useJournalStore.getState().reindexEntry('e1', config)

    expect(processAllEntriesMock).toHaveBeenCalledTimes(1)
    expect(processEntryMock).toHaveBeenCalledTimes(1)
    expect(processEntryMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), config, undefined)
    expect(useJournalStore.getState().entries[0].indexed).toBe(true)
  })
})

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

/** No Tauri in jsdom: every disk write is a no-op and nothing is on disk. */
vi.mock('../../services/fs', () => ({
  hasFileSystem: () => false,
  saveProfileToDisk: vi.fn(async () => {}),
  saveProfileVersionToDisk: vi.fn(async () => {}),
  loadProfileHistoryFromDisk: vi.fn(async () => []),
  deleteProfileVersionFromDisk: vi.fn(async () => {}),
}))

import { useProfileStore } from '../../stores/profileStore'
import type { PsychologicalProfile } from '../../types/profile'

function makeProfile(overrides: Partial<PsychologicalProfile> = {}): PsychologicalProfile {
  return {
    summary: 'A summary.', themes: [{ theme: 'work', frequency: 5, description: 'd' }], cognitivePatterns: [],
    strengths: [], growthAreas: [], frameworkInsights: [], emotionalTrends: [],
    averageMood: 6, avgEntryLength: 120, reflectionDepth: 'Medium', journalingStreak: 2,
    entriesAnalyzed: 10, updatedAt: '2025-03-01T10:00:00.000Z', fullProfile: '# First',
    ...overrides,
  }
}

beforeEach(() => {
  idbStore.clear()
  useProfileStore.setState({ profile: null, versions: [], loaded: false, generating: false })
})

describe('Profile history: nothing generated is ever overwritten', () => {
  it('keeps every generation, selects the newest, and lets an older one be put back in use', async () => {
    /**
     * Two generations must both survive, the newest becomes the selected
     * profile (the value under `nopy-profile`, which Context and Chat read),
     * and selecting the older one swaps what is in use without touching
     * the history.
     * Input: add a version from 1 March, then one from 2 March; select the
     * first again.
     * Expected: two versions newest first, `profile` and `nopy-profile` are
     * the 2 March one, then after selecting, the 1 March one; still two
     * versions.
     */
    const store = useProfileStore.getState()
    await store.addVersion(makeProfile({ id: 'v1', createdAt: '2025-03-01T10:00:00.000Z', updatedAt: '2025-03-01T10:00:00.000Z' }))
    await store.addVersion(makeProfile({ id: 'v2', createdAt: '2025-03-02T10:00:00.000Z', updatedAt: '2025-03-02T10:00:00.000Z', fullProfile: '# Second' }))

    expect(useProfileStore.getState().versions.map((v) => v.id)).toEqual(['v2', 'v1'])
    expect(useProfileStore.getState().profile?.id).toBe('v2')
    expect((idbStore.get('nopy-profile') as PsychologicalProfile).fullProfile).toBe('# Second')

    await useProfileStore.getState().selectVersion('v1')
    expect(useProfileStore.getState().profile?.fullProfile).toBe('# First')
    expect((idbStore.get('nopy-profile') as PsychologicalProfile).id).toBe('v1')
    expect(useProfileStore.getState().versions).toHaveLength(2)
  })

  it('refuses to delete the version in use and removes any other completely', async () => {
    /**
     * Deleting the selected profile would leave Context and Chat with
     * nothing; every other version can go, and its IndexedDB item goes
     * with it.
     * Input: two versions, v2 selected; delete v2, then v1.
     * Expected: v2 delete returns false and changes nothing; v1 delete
     * returns true, the list has only v2, and v1's key is gone.
     */
    const store = useProfileStore.getState()
    await store.addVersion(makeProfile({ id: 'v1', createdAt: '2025-03-01T10:00:00.000Z' }))
    await store.addVersion(makeProfile({ id: 'v2', createdAt: '2025-03-02T10:00:00.000Z' }))

    expect(await useProfileStore.getState().deleteVersion('v2')).toBe(false)
    expect(useProfileStore.getState().versions).toHaveLength(2)

    expect(await useProfileStore.getState().deleteVersion('v1')).toBe(true)
    expect(useProfileStore.getState().versions.map((v) => v.id)).toEqual(['v2'])
    expect(idbStore.has('nopy-profile-version:v1')).toBe(false)
    expect(idbStore.has('nopy-profile-version:v2')).toBe(true)
  })

  it('adopts a profile saved before versioning as the first history entry, and clear() removes everything', async () => {
    /**
     * Existing users have a lone `nopy-profile` with no id. Loading must
     * give it an id and list it, so it is never lost; switching journals
     * must leave no version keys behind.
     * Input: a legacy profile in IndexedDB; loadProfile; then clear.
     * Expected: one version with a generated id and the same summary; after
     * clear no `nopy-profile*` keys remain.
     */
    idbStore.set('nopy-profile', makeProfile({ summary: 'Legacy summary.' }))
    await useProfileStore.getState().loadProfile()

    const state = useProfileStore.getState()
    expect(state.versions).toHaveLength(1)
    expect(state.profile?.id).toMatch(/^legacy-/)
    expect(state.profile?.summary).toBe('Legacy summary.')
    expect(idbStore.has(`nopy-profile-version:${state.profile!.id}`)).toBe(true)

    await useProfileStore.getState().clear()
    expect([...idbStore.keys()].filter((k) => String(k).startsWith('nopy-profile'))).toEqual([])
  })
})

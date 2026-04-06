import { create } from 'zustand'
import { get, set } from 'idb-keyval'
import type { PsychologicalProfile } from '../types/profile'
import type { JournalEntry } from '../types/journal'
import { saveProfileToDisk } from '../services/fs'
import { useSettingsStore } from './settingsStore'
import { processAllEntries, generateProfileFromEntries, computeLocalStats } from '../services/entryProcessor'
import { useJournalStore } from './journalStore'

interface ProfileState {
  profile: PsychologicalProfile | null
  loaded: boolean
  loadProfile: () => Promise<void>
  setProfile: (profile: PsychologicalProfile) => Promise<void>
  generateProfile: (entries: JournalEntry[], apiKey: string, onProgress: (current: number, total: number, title: string) => void) => Promise<void>
}

export const useProfileStore = create<ProfileState>()((setState, getState) => ({
  profile: null,
  loaded: false,

  loadProfile: async () => {
    const profile = await get<PsychologicalProfile>('nopy-profile')
    setState({ profile: profile ?? null, loaded: true })
  },

  setProfile: async (profile) => {
    setState({ profile })
    await set('nopy-profile', profile)
    await saveProfileToDisk(profile, useSettingsStore.getState().journalPath)
  },

  generateProfile: async (entries, apiKey, onProgress) => {
    // Step 1: Process unindexed entries
    const unindexed = entries.filter((e) => !e.indexed)
    if (unindexed.length > 0) {
      const results = await processAllEntries(entries, apiKey, false, onProgress)
      if (results.size > 0) {
        // Update journal store with processed metadata
        const journalStore = useJournalStore.getState()
        const now = new Date().toISOString()
        const updated = journalStore.entries.map((e) => {
          const meta = results.get(e.id)
          if (!meta) return e
          return { ...e, mood: meta.mood, tags: meta.tags, summary: meta.summary, emotionalValence: meta.emotionalValence, indexed: true, updatedAt: now }
        })
        useJournalStore.setState({ entries: updated })
        await set('nopy-entries', updated)
        entries = updated
      }
    }

    // Step 2: Compute local stats
    const localStats = computeLocalStats(entries)

    // Step 3: Generate narrative profile from AI
    onProgress(0, 1, 'Generating psychological profile...')
    const narrative = await generateProfileFromEntries(entries, apiKey)

    // Step 4: Merge into full profile and save
    const profile: PsychologicalProfile = {
      ...narrative,
      ...localStats,
      entriesAnalysed: entries.filter((e) => e.indexed).length,
      updatedAt: new Date().toISOString(),
    }

    const { setProfile } = getState()
    await setProfile(profile)
  },
}))

import { create } from 'zustand'
import { get, set } from 'idb-keyval'
import type { PsychologicalProfile } from '../types/profile'
import type { JournalEntry } from '../types/journal'
import { saveProfileToDisk } from '../services/fs'
import { useSettingsStore } from './settingsStore'
import { processAllEntries, generateProfileFromEntries, generateFullProfile, computeLocalStats } from '../services/entryProcessor'
import { useJournalStore } from './journalStore'
import { saveEntryToDisk } from '../services/fs'

interface ProfileState {
  profile: PsychologicalProfile | null
  loaded: boolean
  loadProfile: () => Promise<void>
  setProfile: (profile: PsychologicalProfile) => Promise<void>
  generateProfile: (
    entries: JournalEntry[],
    apiKey: string,
    onPhase: (phase: string) => void,
    onProgress: (current: number, total: number, title: string) => void,
  ) => Promise<void>
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

  generateProfile: async (entries, apiKey, onPhase = (_p: string) => {}, onProgress = (_c: number, _t: number, _l: string) => {}) => {
    // Step 1: Process unindexed entries via Haiku
    const unindexed = entries.filter((e) => !e.indexed)
    if (unindexed.length > 0) {
      onPhase(`Step 1/5 — Indexing ${unindexed.length} unprocessed entries...`)
      const results = await processAllEntries(entries, apiKey, false, onProgress)
      if (results.size > 0) {
        const journalStore = useJournalStore.getState()
        const now = new Date().toISOString()
        const updated = journalStore.entries.map((e) => {
          const meta = results.get(e.id)
          if (!meta) return e
          return { ...e, mood: meta.mood, tags: meta.tags, summary: meta.summary, emotionalValence: meta.emotionalValence, indexed: true, updatedAt: now }
        })
        useJournalStore.setState({ entries: updated })
        await set('nopy-entries', updated)
        // Write processed entries to disk
        const journalPath = useSettingsStore.getState().journalPath
        for (const [id] of results) {
          const entry = updated.find((e) => e.id === id)
          if (entry) await saveEntryToDisk(entry, journalPath)
        }
        entries = updated
      }
    } else {
      onPhase('Step 1/5 — All entries already indexed')
    }

    // Step 2: Compute local stats
    onPhase('Step 2/5 — Computing metrics...')
    onProgress?.(0, 0, '')
    const localStats = computeLocalStats(entries)

    // Step 3: Generate summary profile via Haiku
    onPhase('Step 3/5 — Generating summary profile (Haiku)...')
    const narrative = await generateProfileFromEntries(entries, apiKey)

    // Step 4: Generate full psychological profile via Opus
    onPhase('Step 4/5 — Writing full psychological profile (Opus 4.6)...')
    let fullProfile: string | null = null
    try {
      fullProfile = await generateFullProfile(entries, apiKey)
    } catch (e) {
      console.error('[profile] Full profile generation failed:', e)
      onPhase('Step 4/5 — Full profile generation failed, continuing...')
    }

    // Step 5: Save everything
    onPhase('Step 5/5 — Saving profile...')
    const profile: PsychologicalProfile = {
      ...narrative,
      ...localStats,
      entriesAnalysed: entries.filter((e) => e.indexed).length,
      updatedAt: new Date().toISOString(),
      fullProfile,
    }

    const { setProfile } = getState()
    await setProfile(profile)
    onPhase('Profile generated successfully')
  },
}))

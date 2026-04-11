import { create } from 'zustand'
import { get, set, del } from 'idb-keyval'
import type { PsychologicalProfile } from '../types/profile'
import type { JournalEntry } from '../types/journal'
import { saveProfileToDisk } from '../services/fs'
import { useSettingsStore } from './settingsStore'
import { processAllEntries, generateProfileFromEntries, generateFullProfile, computeLocalStats } from '../services/entryProcessor'
import { useJournalStore } from './journalStore'

interface ProfileState {
  profile: PsychologicalProfile | null
  loaded: boolean
  generating: boolean
  lastError: string | null
  phase: string
  progress: { current: number; total: number; title: string }
  clearLastError: () => void
  loadProfile: () => Promise<void>
  setProfile: (profile: PsychologicalProfile) => Promise<void>
  generateProfile: (
    entries: JournalEntry[],
    apiKey: string,
    signal?: AbortSignal,
  ) => Promise<void>
  clear: () => Promise<void>
}

export const useProfileStore = create<ProfileState>()((setState, getState) => ({
  profile: null,
  loaded: false,
  generating: false,
  lastError: null,
  phase: '',
  progress: { current: 0, total: 0, title: '' },

  clearLastError: () => setState({ lastError: null }),

  loadProfile: async () => {
    const profile = await get<PsychologicalProfile>('nopy-profile')
    console.log('[profileStore] loadProfile: profile found', profile != null, profile ? '| entriesAnalyzed ' + profile.entriesAnalyzed : '')
    setState({ profile: profile ?? null, loaded: true })
  },

  setProfile: async (profile) => {
    setState({ profile, lastError: null })
    await set('nopy-profile', profile)
    try {
      await saveProfileToDisk(profile, useSettingsStore.getState().journalPath)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ lastError: `Failed to save profile to disk: ${msg}` })
      throw e
    }
  },

  generateProfile: async (entries, apiKey, signal) => {
    const setPhase = (phase: string) => setState({ phase })
    const setProgress = (current: number, total: number, title: string) => setState({ progress: { current, total, title } })
    setState({ generating: true, phase: '', progress: { current: 0, total: 0, title: '' } })
    console.log('[profileStore] generateProfile: starting | total entries', entries.length)
    try {
    // Step 1: Process unindexed entries via Haiku
    const unindexed = entries.filter((e) => !e.indexed)
    console.log('[profileStore] Step 1/5: unindexed entries to process', unindexed.length)
    if (unindexed.length > 0) {
      setPhase(`Step 1/5 — Indexing ${unindexed.length} unprocessed entries...`)
      const results = await processAllEntries(entries, apiKey, false, setProgress, signal)
      if (results.size > 0) {
        await useJournalStore.getState().applyProcessedMetadata(results)
        entries = useJournalStore.getState().entries
        console.log('[profileStore] Step 1/5: processed', results.size, 'entries')
      }
    } else {
      console.log('[profileStore] Step 1/5: all entries already indexed')
      setPhase('Step 1/5 — All entries already indexed')
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Step 2: Compute local stats
    console.log('[profileStore] Step 2/5: computing local stats on', entries.length, 'entries')
    setPhase('Step 2/5 — Computing metrics...')
    setProgress(0, 0, '')
    const localStats = computeLocalStats(entries)

    console.log('[profileStore] Step 2/5: localStats — averageMood', localStats.averageMood, '| streak', localStats.journalingStreak, '| avgEntryLength', localStats.avgEntryLength, '| reflectionDepth', localStats.reflectionDepth)

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Step 3: Generate summary profile via Haiku
    console.log('[profileStore] Step 3/5: generating summary profile via Haiku')
    setPhase('Step 3/5 — Generating summary profile (Haiku)...')
    const narrative = await generateProfileFromEntries(entries, apiKey, signal)

    console.log('[profileStore] Step 3/5: summary profile generated')

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Step 4: Generate full psychological profile via Opus
    console.log('[profileStore] Step 4/5: generating full profile via Opus')
    setPhase('Step 4/5 — Writing full psychological profile (Opus 4.6)...')
    let fullProfile: string | null = null
    try {
      fullProfile = await generateFullProfile(entries, apiKey, signal)
      console.log('[profileStore] Step 4/5: full profile generated', fullProfile?.length ?? 0, 'chars')
    } catch (e) {
      console.error('[profileStore] Step 4/5: full profile generation failed —', e)
      setPhase('Step 4/5 — Full profile generation failed, continuing...')
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Step 5: Save everything
    console.log('[profileStore] Step 5/5: saving profile')
    setPhase('Step 5/5 — Saving profile...')
    const profile: PsychologicalProfile = {
      ...narrative,
      ...localStats,
      entriesAnalyzed: entries.filter((e) => e.indexed).length,
      updatedAt: new Date().toISOString(),
      fullProfile,
    }

    const { setProfile } = getState()
    await setProfile(profile)
    console.log('[profileStore] generateProfile: complete | entriesAnalyzed', profile.entriesAnalyzed, '| themes', profile.themes.length, '| cognitivePatterns', profile.cognitivePatterns.length)
    setPhase('Profile generated successfully')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        console.log('[profileStore] generateProfile: aborted by user')
        setState({ phase: 'Cancelled' })
      } else {
        console.error('[profileStore] generateProfile: failed —', e)
        const msg = e instanceof Error ? e.message : 'check console for details'
        setState({ phase: `Generation failed — ${msg}` })
      }
    } finally {
      setTimeout(() => setState({ generating: false, phase: '' }), 2000)
    }
  },

  clear: async () => {
    setState({ profile: null, loaded: false })
    await del('nopy-profile')
  },
}))

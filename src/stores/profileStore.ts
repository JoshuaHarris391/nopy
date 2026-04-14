import { create } from 'zustand'
import { get, set, del } from 'idb-keyval'
import type { PsychologicalProfile } from '../types/profile'
import type { JournalEntry } from '../types/journal'
import { hasFileSystem, saveProfileToDisk } from '../services/fs'
import { PsychologicalProfileSchema } from '../schemas/profile'
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
  loadProfileFromDisk: () => Promise<boolean>
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

  loadProfileFromDisk: async () => {
    const journalPath = useSettingsStore.getState().journalPath
    if (!hasFileSystem() || !journalPath) return false
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')
    const filePath = `${journalPath}/profiles/profile.json`
    if (!(await exists(filePath))) return false
    try {
      const text = await readTextFile(filePath)
      const parsed = PsychologicalProfileSchema.safeParse(JSON.parse(text))
      if (!parsed.success) {
        console.warn('[profileStore] profile.json failed schema validation', parsed.error.issues)
        return false
      }
      setState({ profile: parsed.data, loaded: true, lastError: null })
      await set('nopy-profile', parsed.data)
      console.log('[profileStore] Restored profile from disk | entriesAnalyzed', parsed.data.entriesAnalyzed)
      return true
    } catch (e) {
      console.warn('[profileStore] Failed to load profile from disk:', e)
      return false
    }
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

    // Build dynamic step list based on what actually needs to happen
    const unindexed = entries.filter((e) => !e.indexed)
    const steps: string[] = []
    if (unindexed.length > 0) steps.push('index')
    steps.push('stats', 'summary', 'full', 'save')
    const totalSteps = steps.length
    const stepNum = (id: string) => steps.indexOf(id) + 1

    try {
    // Index unprocessed entries via Haiku
    if (unindexed.length > 0) {
      const s = stepNum('index')
      setPhase(`Step ${s}/${totalSteps} — Indexing ${unindexed.length} unprocessed entries...`)
      const results = await processAllEntries(entries, apiKey, false, setProgress, signal)
      if (results.size > 0) {
        await useJournalStore.getState().applyProcessedMetadata(results)
        entries = useJournalStore.getState().entries
        console.log(`[profileStore] Step ${s}/${totalSteps}: processed`, results.size, 'entries')
      }
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Compute local stats
    const sStats = stepNum('stats')
    setPhase(`Step ${sStats}/${totalSteps} — Computing metrics...`)
    setProgress(0, 0, '')
    const localStats = computeLocalStats(entries)
    console.log(`[profileStore] Step ${sStats}/${totalSteps}: localStats — averageMood`, localStats.averageMood, '| streak', localStats.journalingStreak)

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Generate summary profile via Haiku (streaming)
    const sSummary = stepNum('summary')
    setPhase(`Step ${sSummary}/${totalSteps} — Generating summary profile (Haiku)...`)
    setProgress(0, 0, 'Waiting for response...')
    const narrative = await generateProfileFromEntries(
      entries, apiKey,
      (chars) => setProgress(Math.min(chars, 8000), 8000, `${chars} chars received`),
      signal,
    )
    console.log(`[profileStore] Step ${sSummary}/${totalSteps}: summary profile generated`)

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Generate full psychological profile via Opus (streaming)
    const sFull = stepNum('full')
    setPhase(`Step ${sFull}/${totalSteps} — Writing full psychological profile (Opus)...`)
    setProgress(0, 0, 'Waiting for response...')
    let fullProfile: string | null = null
    try {
      fullProfile = await generateFullProfile(
        entries, apiKey,
        (chars) => setProgress(Math.min(chars, 20000), 20000, `${chars} chars received`),
        signal,
      )
      console.log(`[profileStore] Step ${sFull}/${totalSteps}: full profile generated`, fullProfile?.length ?? 0, 'chars')
    } catch (e) {
      console.error(`[profileStore] Step ${sFull}/${totalSteps}: full profile generation failed —`, e)
      setPhase(`Step ${sFull}/${totalSteps} — Full profile generation failed, continuing...`)
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Save everything
    const sSave = stepNum('save')
    setPhase(`Step ${sSave}/${totalSteps} — Saving profile...`)
    setProgress(0, 0, '')
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

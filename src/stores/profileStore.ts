import { create } from 'zustand'
import { get, set, del } from 'idb-keyval'
import type { PsychologicalProfile } from '../types/profile'
import type { JournalEntry } from '../types/journal'
import { hasFileSystem, saveProfileToDisk } from '../services/fs'
import { PsychologicalProfileSchema } from '../schemas/profile'
import { useSettingsStore } from './settingsStore'
import { processAllEntries, generateProfileFromEntries, generateFullProfile, computeLocalStats } from '../services/entryProcessor'
import { buildCorpusReport, selectEntriesForFullProfile, isStaleIndex } from '../services/entryRecords'
import { CURRENT_INDEX_VERSION } from '../schemas/journal'
import { getModelContextWindow } from '../services/models'
import { useModelCatalogStore } from './modelCatalogStore'
import { useJournalStore } from './journalStore'
import { useNotificationStore } from './notificationStore'
import { fetchModels, resolveModel } from '../services/llm'
import type { LlmConfig } from '../types/settings'

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
    config: LlmConfig,
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

  generateProfile: async (entries, config, signal) => {
    // Private mode: profile generation would index and summarise the journal
    // with an LLM, so it is a no-op until the user switches private mode off.
    if (useSettingsStore.getState().privateMode) return
    const setPhase = (phase: string) => setState({ phase })
    const setProgress = (current: number, total: number, title: string) => setState({ progress: { current, total, title } })
    setState({ generating: true, phase: '', progress: { current: 0, total: 0, title: '' } })
    console.log('[profileStore] generateProfile: starting | total entries', entries.length)

    // Resolve display names for the lightweight + main roles so phase
    // strings show what the user picked in Settings (e.g. "Claude Haiku
    // 4.5" or "gpt-4o-mini") rather than a hardcoded model name. One
    // fetchModels() call covers both labels; on any failure we fall back
    // to the raw model ids — phase strings must never block.
    let lightweightLabel: string
    let mainLabel: string
    try {
      const lightweightId = resolveModel(config, 'lightweight')
      const mainId = resolveModel(config, 'main')
      lightweightLabel = lightweightId
      mainLabel = mainId
      try {
        const models = await fetchModels(config)
        const map = new Map(models.map((m) => [m.id, m.displayName]))
        lightweightLabel = map.get(lightweightId) ?? lightweightId
        mainLabel = map.get(mainId) ?? mainId
      } catch {
        // Network/auth error — keep the raw ids as labels.
      }
    } catch {
      // resolveModel only throws when a slot is blank with no fallback.
      // The phase strings below still need *something*; fall through with
      // generic placeholders rather than crash the whole pipeline. The
      // actual provider call further down will surface the real error.
      lightweightLabel = 'lightweight model'
      mainLabel = 'main model'
    }

    const staleCount = entries.filter(isStaleIndex).length
    if (staleCount > 0) {
      console.log('[profileStore] generateProfile:', staleCount, 'entries carry an older index; re-index from Settings for richer evidence')
    }
    const mode = useSettingsStore.getState().profileGenerationMode

    // Build dynamic step list based on what actually needs to happen
    const unindexed = entries.filter((e) => !e.indexed)
    const steps: string[] = []
    if (unindexed.length > 0) steps.push('index')
    steps.push('stats', 'summary', 'full', 'save')
    const totalSteps = steps.length
    const stepNum = (id: string) => steps.indexOf(id) + 1

    try {
    // Index unprocessed entries via the lightweight model
    if (unindexed.length > 0) {
      const s = stepNum('index')
      setPhase(`Step ${s}/${totalSteps} — Indexing ${unindexed.length} unprocessed entries...`)
      const results = await processAllEntries(entries, config, 'unindexed', setProgress, signal)
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

    // Deterministic rollups over the whole journal; both LLM steps read it.
    const corpusReport = buildCorpusReport(entries)

    // Generate summary profile via the lightweight model (streaming)
    const sSummary = stepNum('summary')
    setPhase(`Step ${sSummary}/${totalSteps} — Generating summary profile (${lightweightLabel})...`)
    setProgress(0, 0, 'Waiting for response...')
    const narrative = await generateProfileFromEntries(
      entries, config,
      (chars) => setProgress(Math.min(chars, 8000), 8000, `${chars} chars received`),
      signal,
      corpusReport,
    )
    console.log(`[profileStore] Step ${sSummary}/${totalSteps}: summary profile generated`)

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Generate (or revise) the full psychological profile via the main model
    // (streaming). Reads index records only — never raw journal text.
    const sFull = stepNum('full')
    const prior = getState().profile
    const selection = selectEntriesForFullProfile(entries, prior, mode)
    // A previous full profile survives a failed or skipped step so incremental
    // mode never loses the work it is meant to build on.
    let fullProfile: string | null = prior?.fullProfile ?? null
    let analyzedEntryIds: string[] = prior?.analyzedEntryIds ?? []
    if (selection.isRevision && selection.entries.length === 0) {
      setPhase(`Step ${sFull}/${totalSteps} — Full profile up to date (no new entries)`)
      console.log(`[profileStore] Step ${sFull}/${totalSteps}: nothing new since the last full profile — skipped`)
    } else {
      setPhase(selection.isRevision
        ? `Step ${sFull}/${totalSteps} — Revising full profile with ${selection.entries.length} new ${selection.entries.length === 1 ? 'entry' : 'entries'} (${mainLabel})...`
        : `Step ${sFull}/${totalSteps} — Writing full psychological profile (${mainLabel})...`)
      setProgress(0, 0, 'Waiting for response...')
      try {
        const hostedId = config.provider === 'openai' ? config.openaiModel : config.anthropicMainModel
        const catalogWindow = config.provider === 'local' ? undefined : useModelCatalogStore.getState().contextWindowFor(hostedId)
        const { tokens: contextWindowTokens } = getModelContextWindow(
          config, undefined, useSettingsStore.getState().modelContextWindowOverride, catalogWindow,
        )
        fullProfile = await generateFullProfile(selection.entries, config, {
          corpusReport,
          priorProfile: selection.isRevision ? prior?.fullProfile : null,
          contextWindowTokens,
          onStreamProgress: (chars) => setProgress(Math.min(chars, 20000), 20000, `${chars} chars received`),
          signal,
        })
        const sentIds = selection.entries.map((e) => e.id)
        analyzedEntryIds = selection.isRevision ? [...new Set([...analyzedEntryIds, ...sentIds])] : sentIds
        console.log(`[profileStore] Step ${sFull}/${totalSteps}: full profile ${selection.isRevision ? 'revised' : 'generated'}`, fullProfile?.length ?? 0, 'chars')
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e
        console.error(`[profileStore] Step ${sFull}/${totalSteps}: full profile generation failed —`, e)
        setPhase(`Step ${sFull}/${totalSteps} — Full profile generation failed, continuing...`)
      }
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
      analyzedEntryIds,
      indexVersionUsed: CURRENT_INDEX_VERSION,
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
        // Same rationale as indexingStore: profile gen takes minutes; if
        // the user navigated away the inline phase text is invisible.
        // Bottom-right notification ensures they see the failure.
        useNotificationStore.getState().push({
          kind: 'error',
          title: 'Profile generation failed',
          message: msg,
        })
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

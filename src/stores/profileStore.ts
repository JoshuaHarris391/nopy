import { create } from 'zustand'
import { get, set, del } from 'idb-keyval'
import type { PsychologicalProfile, ProfileVersionMeta } from '../types/profile'
import type { JournalEntry } from '../types/journal'
import {
  hasFileSystem, saveProfileToDisk, saveProfileVersionToDisk, loadProfileHistoryFromDisk, deleteProfileVersionFromDisk,
} from '../services/fs'
import { PsychologicalProfileSchema } from '../schemas/profile'
import { useSettingsStore } from './settingsStore'
import { processAllEntries, generateProfileFromEntries, generateFullProfile, computeLocalStats } from '../services/entryProcessor'
import { buildCorpusReport, selectEntriesForFullProfile, isStaleIndex, applyProfileScope } from '../services/entryRecords'
import { CURRENT_INDEX_VERSION } from '../schemas/journal'
import { getModelContextWindow } from '../services/models'
import { useModelCatalogStore } from './modelCatalogStore'
import { useJournalStore } from './journalStore'
import { useNotificationStore } from './notificationStore'
import { fetchModels, resolveModel } from '../services/llm'
import type { LlmConfig } from '../types/settings'

/**
 * Profile store.
 *
 * `profile` is the SELECTED version: the one the Profile page shows and the
 * one Context and Chat inject. It lives under the IndexedDB key
 * `nopy-profile` and on disk as profiles/profile.json, exactly as before
 * versions existed, so every consumer keeps reading a plain profile.
 *
 * Every generation is also kept as a version: a light `ProfileVersionMeta`
 * list under `nopy-profile-history`, the full object under
 * `nopy-profile-version:<id>`, and profiles/history/<id>.json (+ .md) on
 * disk. Nothing is overwritten; the newest generation is selected
 * automatically and any version can be selected or deleted (except the one
 * in use).
 */

const SELECTED_KEY = 'nopy-profile'
const HISTORY_KEY = 'nopy-profile-history'
const versionKey = (id: string) => `nopy-profile-version:${id}`

/** Profiles saved before versioning have no id; give them a stable one. */
function ensureIdentity(profile: PsychologicalProfile): PsychologicalProfile {
  if (profile.id) return profile
  return { ...profile, id: `legacy-${profile.updatedAt}`, createdAt: profile.createdAt ?? profile.updatedAt }
}

export function toVersionMeta(profile: PsychologicalProfile): ProfileVersionMeta {
  return {
    id: profile.id!,
    createdAt: profile.createdAt ?? profile.updatedAt,
    entriesAnalyzed: profile.entriesAnalyzed,
    scope: profile.scope ?? { kind: 'all' },
    isRevision: profile.isRevision ?? false,
    basedOn: profile.basedOn ?? null,
    hasFullProfile: !!profile.fullProfile,
    indexVersionUsed: profile.indexVersionUsed ?? null,
  }
}

function sortNewestFirst(versions: ProfileVersionMeta[]): ProfileVersionMeta[] {
  return [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

interface ProfileState {
  /** The selected version. */
  profile: PsychologicalProfile | null
  /** Every kept generation, newest first. */
  versions: ProfileVersionMeta[]
  loaded: boolean
  generating: boolean
  lastError: string | null
  phase: string
  progress: { current: number; total: number; title: string }
  clearLastError: () => void
  loadProfile: () => Promise<void>
  loadProfileFromDisk: () => Promise<boolean>
  /** Write `profile` as the selected version (IndexedDB + profile.json). */
  setProfile: (profile: PsychologicalProfile) => Promise<void>
  /** Keep a new generation and select it. */
  addVersion: (profile: PsychologicalProfile) => Promise<void>
  selectVersion: (id: string) => Promise<void>
  /** Refuses the selected version; returns whether anything was deleted. */
  deleteVersion: (id: string) => Promise<boolean>
  generateProfile: (
    entries: JournalEntry[],
    config: LlmConfig,
    signal?: AbortSignal,
  ) => Promise<void>
  clear: () => Promise<void>
}

export const useProfileStore = create<ProfileState>()((setState, getState) => ({
  profile: null,
  versions: [],
  loaded: false,
  generating: false,
  lastError: null,
  phase: '',
  progress: { current: 0, total: 0, title: '' },

  clearLastError: () => setState({ lastError: null }),

  loadProfile: async () => {
    const stored = await get<PsychologicalProfile>(SELECTED_KEY)
    let versions = sortNewestFirst((await get<ProfileVersionMeta[]>(HISTORY_KEY)) ?? [])
    let profile: PsychologicalProfile | null = null
    if (stored) {
      profile = ensureIdentity(stored)
      // A profile saved before versioning becomes the first history entry.
      if (!versions.some((v) => v.id === profile!.id)) {
        versions = sortNewestFirst([toVersionMeta(profile), ...versions])
        await set(versionKey(profile.id!), profile)
        await set(HISTORY_KEY, versions)
      }
      if (profile !== stored) await set(SELECTED_KEY, profile)
    }
    console.log('[profileStore] loadProfile: selected', profile != null, '| versions', versions.length)
    setState({ profile, versions, loaded: true })
  },

  loadProfileFromDisk: async () => {
    const journalPath = useSettingsStore.getState().journalPath
    if (!hasFileSystem() || !journalPath) return false
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')
    try {
      const history = await loadProfileHistoryFromDisk(journalPath)
      let selected: PsychologicalProfile | null = null
      const filePath = `${journalPath}/profiles/profile.json`
      if (await exists(filePath)) {
        const parsed = PsychologicalProfileSchema.safeParse(JSON.parse(await readTextFile(filePath)))
        if (parsed.success) selected = ensureIdentity(parsed.data)
        else console.warn('[profileStore] profile.json failed schema validation', parsed.error.issues)
      }
      // A lone profile.json from before versioning joins the history on disk.
      if (selected && !history.some((p) => p.id === selected!.id)) {
        await saveProfileVersionToDisk(selected, journalPath)
        history.unshift(selected)
      }
      if (!selected && history.length > 0) selected = history[0]
      if (!selected) return false

      const versions = sortNewestFirst(history.map(toVersionMeta))
      for (const p of history) await set(versionKey(p.id!), p)
      await set(HISTORY_KEY, versions)
      await set(SELECTED_KEY, selected)
      setState({ profile: selected, versions, loaded: true, lastError: null })
      console.log('[profileStore] Restored profile from disk | versions', versions.length, '| selected entriesAnalyzed', selected.entriesAnalyzed)
      return true
    } catch (e) {
      console.warn('[profileStore] Failed to load profile from disk:', e)
      return false
    }
  },

  setProfile: async (profile) => {
    setState({ profile, lastError: null })
    await set(SELECTED_KEY, profile)
    try {
      await saveProfileToDisk(profile, useSettingsStore.getState().journalPath)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ lastError: `Failed to save profile to disk: ${msg}` })
      throw e
    }
  },

  addVersion: async (input) => {
    const profile: PsychologicalProfile = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      createdAt: input.createdAt ?? input.updatedAt,
    }
    const versions = sortNewestFirst([toVersionMeta(profile), ...getState().versions.filter((v) => v.id !== profile.id)])
    await set(versionKey(profile.id!), profile)
    await set(HISTORY_KEY, versions)
    setState({ versions })
    try {
      await saveProfileVersionToDisk(profile, useSettingsStore.getState().journalPath)
    } catch (e) {
      console.warn('[profileStore] Failed to save profile version to disk:', e)
    }
    await getState().setProfile(profile)
  },

  selectVersion: async (id) => {
    let profile = await get<PsychologicalProfile>(versionKey(id))
    if (!profile) {
      const history = await loadProfileHistoryFromDisk(useSettingsStore.getState().journalPath)
      profile = history.find((p) => p.id === id)
      if (profile) await set(versionKey(id), profile)
    }
    if (!profile) {
      console.warn('[profileStore] selectVersion: version not found', id)
      return
    }
    await getState().setProfile(profile)
    console.log('[profileStore] selectVersion:', id)
  },

  deleteVersion: async (id) => {
    if (getState().profile?.id === id) {
      console.warn('[profileStore] deleteVersion: refusing to delete the selected version', id)
      return false
    }
    const versions = getState().versions.filter((v) => v.id !== id)
    await del(versionKey(id))
    await set(HISTORY_KEY, versions)
    setState({ versions })
    try {
      await deleteProfileVersionFromDisk(id, useSettingsStore.getState().journalPath)
    } catch (e) {
      console.warn('[profileStore] Failed to remove profile version from disk:', e)
    }
    return true
  },

  generateProfile: async (allEntries, config, signal) => {
    // Private mode: profile generation would index and summarise the journal
    // with an LLM, so it is a no-op until the user switches private mode off.
    if (useSettingsStore.getState().privateMode) return
    const setPhase = (phase: string) => setState({ phase })
    const setProgress = (current: number, total: number, title: string) => setState({ progress: { current, total, title } })
    setState({ generating: true, phase: '', progress: { current: 0, total: 0, title: '' } })

    // The scope is applied once, here, so every step below (indexing, stats,
    // corpus report, both LLM passes, the recorded counts) sees the same list.
    const scope = useSettingsStore.getState().profileScope
    let entries = applyProfileScope(allEntries, scope)
    console.log('[profileStore] generateProfile: starting | scope', scope.kind, '| entries in scope', entries.length, 'of', allEntries.length)

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
    // Index unprocessed entries (inside the scope) via the lightweight model
    if (unindexed.length > 0) {
      const s = stepNum('index')
      setPhase(`Step ${s}/${totalSteps} — Indexing ${unindexed.length} unprocessed entries...`)
      const results = await processAllEntries(entries, config, 'unindexed', setProgress, signal)
      if (results.size > 0) {
        await useJournalStore.getState().applyProcessedMetadata(results)
        entries = applyProfileScope(useJournalStore.getState().entries, scope)
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

    // Deterministic rollups over the scoped journal; both LLM steps read it.
    const corpusReport = buildCorpusReport(entries)

    // Each step's records are fitted to the window of the model that reads
    // them. `getModelContextWindow` resolves the main slot, so the
    // lightweight window is looked up through a config view that puts the
    // lightweight model id in the main slot.
    const windowFor = (role: 'main' | 'lightweight'): number => {
      const modelId = resolveModel(config, role)
      const view: LlmConfig = role === 'main'
        ? config
        : { ...config, anthropicMainModel: modelId, openaiModel: modelId, localModel: modelId }
      const catalogWindow = config.provider === 'local' ? undefined : useModelCatalogStore.getState().contextWindowFor(modelId)
      return getModelContextWindow(view, undefined, useSettingsStore.getState().modelContextWindowOverride, catalogWindow).tokens
    }

    // Generate summary profile via the lightweight model (streaming)
    const sSummary = stepNum('summary')
    setPhase(`Step ${sSummary}/${totalSteps} — Generating summary profile (${lightweightLabel})...`)
    setProgress(0, 0, 'Waiting for response...')
    const narrative = await generateProfileFromEntries(entries, config, {
      corpusReport,
      contextWindowTokens: windowFor('lightweight'),
      onStreamProgress: (chars) => setProgress(Math.min(chars, 8000), 8000, `${chars} chars received`),
      signal,
    })
    console.log(`[profileStore] Step ${sSummary}/${totalSteps}: summary profile generated`)

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Generate (or revise) the full psychological profile via the main model
    // (streaming). Reads index records only — never raw journal text. A
    // revision builds on the SELECTED version, so choosing an older version
    // and generating branches from it.
    const sFull = stepNum('full')
    const prior = getState().profile
    const selection = selectEntriesForFullProfile(entries, prior, mode, scope)
    // A previous full profile survives a failed or skipped step so incremental
    // mode never loses the work it is meant to build on.
    let fullProfile: string | null = prior?.fullProfile ?? null
    let analyzedEntryIds: string[] = prior?.analyzedEntryIds ?? []
    if (selection.isRevision && selection.entries.length === 0) {
      setPhase(`Step ${sFull}/${totalSteps} — Full profile up to date (no new entries)`)
      console.log(`[profileStore] Step ${sFull}/${totalSteps}: nothing new since the selected full profile — skipped`)
    } else {
      setPhase(selection.isRevision
        ? `Step ${sFull}/${totalSteps} — Revising full profile with ${selection.entries.length} new ${selection.entries.length === 1 ? 'entry' : 'entries'} (${mainLabel})...`
        : `Step ${sFull}/${totalSteps} — Writing full psychological profile (${mainLabel})...`)
      setProgress(0, 0, 'Waiting for response...')
      try {
        fullProfile = await generateFullProfile(selection.entries, config, {
          corpusReport,
          priorProfile: selection.isRevision ? prior?.fullProfile : null,
          contextWindowTokens: windowFor('main'),
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

    // Keep the result as a new version and select it
    const sSave = stepNum('save')
    setPhase(`Step ${sSave}/${totalSteps} — Saving profile...`)
    setProgress(0, 0, '')
    const now = new Date().toISOString()
    const profile: PsychologicalProfile = {
      ...narrative,
      ...localStats,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      entriesAnalyzed: entries.filter((e) => e.indexed).length,
      fullProfile,
      analyzedEntryIds,
      indexVersionUsed: CURRENT_INDEX_VERSION,
      scope,
      isRevision: selection.isRevision,
      basedOn: selection.isRevision ? prior?.id ?? null : null,
    }

    await getState().addVersion(profile)
    console.log('[profileStore] generateProfile: complete | version', profile.id, '| entriesAnalyzed', profile.entriesAnalyzed, '| themes', profile.themes.length)
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
    const { versions } = getState()
    setState({ profile: null, versions: [], loaded: false })
    for (const v of versions) await del(versionKey(v.id))
    await del(HISTORY_KEY)
    await del(SELECTED_KEY)
  },
}))

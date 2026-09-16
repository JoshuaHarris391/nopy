import { Zap, RefreshCw } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { SettingsRow } from '../../ui/SettingsRow'
import { CancellableActionButton } from '../../ui/CancellableActionButton'
import { useShallow } from 'zustand/react/shallow'
import { useSettingsStore, selectLlmConfig } from '../../../stores/settingsStore'
import { useJournalStore } from '../../../stores/journalStore'
import { useIndexingStore } from '../../../stores/indexingStore'
import { isLlmConfigured } from '../../../services/llm'
import { isStaleIndex } from '../../../services/entryRecords'
import { selectStyle } from './styles'

export function MaintenanceSection() {
  const llmConfig = useSettingsStore(useShallow(selectLlmConfig))
  const profileGenerationMode = useSettingsStore((s) => s.profileGenerationMode)
  const setProfileGenerationMode = useSettingsStore((s) => s.setProfileGenerationMode)
  const staleCount = useJournalStore((s) => s.entries.filter(isStaleIndex).length)
  const indexing = useIndexingStore()

  // Hide the section until the active provider is configured — friendlier
  // to hide the button than show one that's guaranteed to fail.
  if (!isLlmConfigured(llmConfig)) return null

  const handleForceUpdate = () => {
    indexing.run(async (onProgress, signal) => {
      const count = await useJournalStore.getState().processEntries(llmConfig, 'all', onProgress, signal)
      return `Done — ${count} entries reprocessed`
    })
  }

  const handleReindexStale = () => {
    indexing.run(async (onProgress, signal) => {
      const count = await useJournalStore.getState().processEntries(llmConfig, 'stale', onProgress, signal)
      return `Done — ${count} entries re-indexed`
    })
  }

  return (
    <SettingsSection title="Maintenance">
      <SettingsRow
        label="Profile generation"
        description={profileGenerationMode === 'incremental'
          ? 'Incremental: revise the existing profile with new entries only.'
          : 'Full: rewrite the profile from every entry each time.'}
      >
        <select
          value={profileGenerationMode}
          onChange={(e) => setProfileGenerationMode(e.target.value as 'incremental' | 'full')}
          style={{ ...selectStyle, minWidth: 160 }}
          aria-label="Profile generation mode"
        >
          <option value="incremental">Incremental</option>
          <option value="full">Full</option>
        </select>
      </SettingsRow>

      {staleCount > 0 && (
        <div style={{ padding: '10px 0' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Re-index outdated entries ({staleCount})</div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
              {staleCount === 1 ? '1 entry was' : `${staleCount} entries were`} indexed with an older, shorter format. Re-indexing gives the profile far richer evidence.
            </div>
          </div>
          <CancellableActionButton
            state={indexing.state}
            result={indexing.result}
            error={indexing.error}
            idleLabel="Re-index Outdated"
            icon={<RefreshCw size={13} strokeWidth={1.8} />}
            onRun={handleReindexStale}
            onAbort={indexing.abort}
          />
        </div>
      )}

      <div style={{ padding: '10px 0' }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Force Update Index</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
            Reprocess all entries with AI, overwriting existing metadata
          </div>
        </div>
        <CancellableActionButton
          state={indexing.state}
          result={indexing.result}
          error={indexing.error}
          idleLabel="Force Update Index"
          icon={<Zap size={13} strokeWidth={1.8} />}
          onRun={handleForceUpdate}
          onAbort={indexing.abort}
        />
      </div>
    </SettingsSection>
  )
}

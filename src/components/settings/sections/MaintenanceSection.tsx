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
  const needing = useJournalStore(useShallow((s) => s.entries.filter((e) => !e.indexed || isStaleIndex(e)).map((e) => e.title)))
  const staleCount = needing.length
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
      const count = await useJournalStore.getState().processEntries(llmConfig, 'needed', onProgress, signal)
      return `Done — ${count} entries indexed`
    })
  }
  const named = needing.slice(0, 3).map((t) => `"${t || 'Untitled'}"`).join(', ') + (needing.length > 3 ? ` and ${needing.length - 3} more` : '')

  return (
    <SettingsSection title="Maintenance">
      <SettingsRow
        label="Profile generation"
        description="Incremental revises the selected profile with new entries only (cheaper, faster). Full rewrites it from every entry in scope (slower, costs more). Also set from the Profile page." 
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
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Re-index un-indexed entries ({staleCount})</div>
            <div data-testid="unindexed-description" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
              {staleCount === 1 ? '1 entry has' : `${staleCount} entries have`} no usable index record (never indexed, indexed with an older format, or a record that could not be read): {named}. Indexing gives the profile far richer evidence.
            </div>
          </div>
          <CancellableActionButton
            state={indexing.state}
            result={indexing.result}
            error={indexing.error}
            idleLabel="Re-index Un-indexed"
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

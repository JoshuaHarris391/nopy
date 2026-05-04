import { Zap } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { CancellableActionButton } from '../../ui/CancellableActionButton'
import { useShallow } from 'zustand/react/shallow'
import { useSettingsStore, selectLlmConfig } from '../../../stores/settingsStore'
import { useJournalStore } from '../../../stores/journalStore'
import { useIndexingStore } from '../../../stores/indexingStore'

export function MaintenanceSection() {
  const llmConfig = useSettingsStore(useShallow(selectLlmConfig))
  const indexing = useIndexingStore()

  // Hide the section until the active provider is configured. In Anthropic
  // mode that means an API key; in local mode that means a model name.
  // The dispatcher would throw NO_MODEL_CONFIGURED otherwise — friendlier
  // to hide the button than show one that's guaranteed to fail.
  const ready = llmConfig.provider === 'anthropic' ? !!llmConfig.apiKey : !!llmConfig.localModel
  if (!ready) return null

  const handleForceUpdate = () => {
    indexing.run(async (onProgress, signal) => {
      const count = await useJournalStore.getState().processEntries(llmConfig, true, onProgress, signal)
      return `Done — ${count} entries reprocessed`
    })
  }

  return (
    <SettingsSection title="Maintenance">
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

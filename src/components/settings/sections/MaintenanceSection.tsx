import { Zap } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { ProgressBar } from '../../ui/ProgressBar'
import { CancellableActionButton } from '../../ui/CancellableActionButton'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useJournalStore } from '../../../stores/journalStore'
import { useCancellableTask } from '../../../hooks/useCancellableTask'

export function MaintenanceSection() {
  const apiKey = useSettingsStore((s) => s.apiKey)
  const task = useCancellableTask<string>()

  if (!apiKey) return null

  const handleForceUpdate = () => {
    task.run(async (onProgress, signal) => {
      const count = await useJournalStore.getState().processEntries(apiKey, true, onProgress, signal)
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
          state={task.state}
          result={task.result}
          error={task.error}
          idleLabel="Force Update Index"
          icon={<Zap size={13} strokeWidth={1.8} />}
          onRun={handleForceUpdate}
          onAbort={task.abort}
        />
        {task.state === 'running' && (
          <div style={{ marginTop: 12 }}>
            <ProgressBar current={task.progress.current} total={task.progress.total} label={task.progress.title} />
          </div>
        )}
      </div>
    </SettingsSection>
  )
}

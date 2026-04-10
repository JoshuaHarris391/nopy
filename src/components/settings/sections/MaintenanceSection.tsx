import { useState, useCallback } from 'react'
import { Zap } from 'lucide-react'
import { SettingsSection } from '../../ui/SettingsSection'
import { ProgressBar } from '../../ui/ProgressBar'
import { Button } from '../../ui/Button'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useJournalStore } from '../../../stores/journalStore'

export function MaintenanceSection() {
  const apiKey = useSettingsStore((s) => s.apiKey)
  const forceProcessing = useJournalStore((s) => s.forceProcessing)
  const forceProgress = useJournalStore((s) => s.forceProgress)
  const forceResult = useJournalStore((s) => s.forceResult)
  const [forceHovered, setForceHovered] = useState(false)

  const handleForceUpdate = useCallback(() => {
    if (!apiKey) return
    useJournalStore.getState().startForceUpdate(apiKey)
  }, [apiKey])

  if (!apiKey) return null

  return (
    <SettingsSection title="Maintenance">
      <div style={{ padding: '10px 0' }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Force Update Index</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
            Reprocess all entries with AI, overwriting existing metadata
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleForceUpdate}
            onMouseEnter={() => setForceHovered(true)}
            onMouseLeave={() => setForceHovered(false)}
            className={forceProcessing ? 'btn-cancellable' : undefined}
          >
            {forceProcessing ? (
              <>
                <span style={{ visibility: forceHovered ? 'hidden' : 'visible' }}><Zap size={13} strokeWidth={1.8} />Reprocessing...</span>
                <span style={{ visibility: forceHovered ? 'visible' : 'hidden' }}><Zap size={13} strokeWidth={1.8} />Stop</span>
              </>
            ) : (
              <><Zap size={13} strokeWidth={1.8} />Force Update Index</>
            )}
          </Button>
          {forceResult && (
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)', fontWeight: 500 }}>
              {forceResult}
            </span>
          )}
        </div>
        {forceProcessing && (
          <div style={{ marginTop: 12 }}>
            <ProgressBar current={forceProgress.current} total={forceProgress.total} label={forceProgress.title} />
          </div>
        )}
      </div>
    </SettingsSection>
  )
}

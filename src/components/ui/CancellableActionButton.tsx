import { useState } from 'react'
import type { ReactNode } from 'react'
import type { TaskState } from '../../hooks/useCancellableTask'
import { Button } from './Button'

interface CancellableActionButtonProps {
  state: TaskState
  result: string | null
  error: string | null
  idleLabel: string
  icon: ReactNode
  onRun: () => void
  onAbort: () => void
}

export function CancellableActionButton({
  state, result, error, idleLabel, icon, onRun, onAbort,
}: CancellableActionButtonProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        onClick={state === 'running' ? onAbort : onRun}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={state === 'running' ? 'btn-cancellable' : undefined}
      >
        {state === 'running' ? (
          <>
            <span style={{ visibility: hovered ? 'hidden' : 'visible' }}>{icon}Processing...</span>
            <span style={{ visibility: hovered ? 'visible' : 'hidden' }}>{icon}Stop</span>
          </>
        ) : (
          <>{icon}{idleLabel}</>
        )}
      </Button>
      {(state === 'done' && result) && (
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)', fontWeight: 500 }}>
          {result}
        </span>
      )}
      {(state === 'error' && error) && (
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--soft-coral)', fontWeight: 500 }}>
          {error}
        </span>
      )}
    </div>
  )
}

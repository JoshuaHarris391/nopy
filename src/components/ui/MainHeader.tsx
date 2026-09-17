import { useNavigate } from 'react-router-dom'
import { BackButton } from './BackButton'
import { useNavigationStore, selectCanGoBack, selectPrevious } from '../../stores/navigationStore'
import { labelForPath } from '../../services/routeLabels'

interface MainHeaderProps {
  title?: string
  /** Replaces the title slot, e.g. a breadcrumb. */
  leading?: React.ReactNode
  /**
   * Always show the arrow and run this instead of history Back. The editor
   * uses it so leaving passes through its unsaved-entry guard.
   */
  back?: { label: string; onBack: () => void }
  /** Never show the arrow, e.g. when a breadcrumb already leads back. */
  hideBack?: boolean
  children?: React.ReactNode
}

/**
 * The page header. Shows a back arrow on pages the reader drilled into from
 * content (navigationStore knows), so no page has to wire one itself.
 */
export function MainHeader({ title, leading, back, hideBack = false, children }: MainHeaderProps) {
  const navigate = useNavigate()
  const canGoBack = useNavigationStore(selectCanGoBack)
  const previous = useNavigationStore(selectPrevious)
  const arrow = back ?? (canGoBack && !hideBack && previous
    ? { label: labelForPath(previous.pathname), onBack: () => navigate(-1) }
    : null)

  return (
    <div
      className="flex items-center justify-between flex-shrink-0"
      style={{
        padding: '0 44px',
        height: 64,
        borderBottom: '1px solid var(--stone)',
        background: 'var(--parchment)',
      }}
    >
      <div className="flex items-center min-w-0">
        {arrow && <BackButton label={arrow.label} onClick={arrow.onBack} />}
        {leading ?? (
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
        )}
      </div>
      {children && <div className="flex items-center gap-2.5">{children}</div>}
    </div>
  )
}

interface LocalStatusIndicatorProps {
  status: 'loading' | 'not-running' | 'no-model' | 'name-mismatch' | 'ready'
  label: string
}

const COLORS: Record<LocalStatusIndicatorProps['status'], string> = {
  loading: 'var(--sage)',
  'not-running': 'var(--soft-coral)',
  'no-model': 'var(--amber)',
  'name-mismatch': 'var(--amber)',
  ready: 'var(--gentle-green)',
}

/**
 * 8px colored dot + label, mirrors the Sidebar online-state pattern. Three
 * outcome colors:
 *   coral  → server isn't running
 *   amber  → server up but model not loaded / name doesn't match
 *   green  → ready to chat
 */
export function LocalStatusIndicator({ status, label }: LocalStatusIndicatorProps) {
  return (
    <div
      role="status"
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--manuscript)' }}
    >
      <span
        aria-hidden
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: COLORS[status],
          flex: '0 0 auto',
          // Subtle pulse on the loading state so users see "checking" without reading the label.
          animation: status === 'loading' ? 'pulse 1.4s ease-in-out infinite' : 'none',
        }}
      />
      {label}
    </div>
  )
}

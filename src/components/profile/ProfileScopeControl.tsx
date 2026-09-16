import type { ProfileScope } from '../../types/profile'
import { selectStyle } from '../settings/sections/styles'

const DEFAULT_COUNT: Record<'entries' | 'months', number> = { entries: 60, months: 6 }

const inputStyle: React.CSSProperties = {
  width: 64, padding: '6px 10px',
  border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-ui)', fontSize: 13,
  color: 'var(--ink)', background: 'var(--warm-cream)', outline: 'none',
}

interface ProfileScopeControlProps {
  scope: ProfileScope
  onChange: (scope: ProfileScope) => void
  disabled?: boolean
}

/**
 * Which index records feed the next generation: every entry, the newest N,
 * or the last N months. The number field is uncontrolled and commits on
 * blur (same pattern as IndexLimitInput) so typing never snaps back.
 */
export function ProfileScopeControl({ scope, onChange, disabled }: ProfileScopeControlProps) {
  const setKind = (kind: ProfileScope['kind']) => {
    if (kind === 'all') onChange({ kind: 'all' })
    else onChange({ kind, count: scope.kind === kind ? scope.count : DEFAULT_COUNT[kind] })
  }
  const commitCount = (raw: string) => {
    if (scope.kind === 'all') return
    const n = parseInt(raw, 10)
    onChange({ kind: scope.kind, count: Number.isNaN(n) || n < 1 ? scope.count : n })
  }

  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <label style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)' }} htmlFor="profile-scope-kind">Scope</label>
      <select
        id="profile-scope-kind"
        aria-label="Profile scope"
        value={scope.kind}
        disabled={disabled}
        onChange={(e) => setKind(e.target.value as ProfileScope['kind'])}
        style={{ ...selectStyle, padding: '5px 10px' }}
      >
        <option value="all">All entries</option>
        <option value="entries">Last N entries</option>
        <option value="months">Last N months</option>
      </select>
      {scope.kind !== 'all' && (
        <input
          type="number"
          min={1}
          step={1}
          aria-label={scope.kind === 'entries' ? 'Number of entries' : 'Number of months'}
          key={`${scope.kind}-${scope.count}`}
          defaultValue={String(scope.count)}
          disabled={disabled}
          onBlur={(e) => commitCount(e.target.value)}
          style={inputStyle}
        />
      )}
    </div>
  )
}

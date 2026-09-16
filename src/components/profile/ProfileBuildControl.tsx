import { selectStyle } from '../settings/sections/styles'

type Mode = 'incremental' | 'full'

interface ProfileBuildControlProps {
  mode: Mode
  onChange: (mode: Mode) => void
  disabled?: boolean
}

/**
 * How the next generation builds the full profile. Mirrors the
 * "Profile generation" setting in Settings → Maintenance; both write the
 * same persisted value.
 */
export function ProfileBuildControl({ mode, onChange, disabled }: ProfileBuildControlProps) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <label style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)' }} htmlFor="profile-build-mode">Build</label>
      <select
        id="profile-build-mode"
        aria-label="Profile build mode"
        title={mode === 'incremental' ? 'Revise the selected profile with new entries only' : 'Rewrite the profile from every entry in scope'}
        value={mode}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Mode)}
        style={{ ...selectStyle, padding: '5px 10px' }}
      >
        <option value="incremental">Incremental</option>
        <option value="full">Full</option>
      </select>
    </div>
  )
}

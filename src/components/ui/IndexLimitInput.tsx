import { useState } from 'react'
import { DEFAULT_JOURNAL_INDEX_LIMIT } from '../../services/contextAssembler'

interface IndexLimitInputProps {
  /** Current limit. `0` means "all" (no cap). */
  value: number
  onChange: (next: number) => void
}

const inputStyle: React.CSSProperties = {
  width: 72, padding: '6px 10px',
  border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-ui)', fontSize: 13,
  color: 'var(--ink)', background: 'var(--warm-cream)', outline: 'none',
}

/**
 * Number-of-entries picker shared by Settings and the Journal Index card modal.
 * A free number input (min 1) plus an "All" toggle. The stored value is a
 * single number where `0` means "all"; when "All" is unchecked we restore the
 * last positive number the user had, so toggling the checkbox is lossless.
 *
 * The number field is uncontrolled (remounted via `key` whenever the external
 * value changes) so the user can type freely; edits commit on blur. This avoids
 * a controlled value snapping back on every keystroke without needing an effect.
 */
export function IndexLimitInput({ value, onChange }: IndexLimitInputProps) {
  const isAll = value <= 0
  // Last positive value, so unchecking "All" restores what the user had.
  const [lastCount, setLastCount] = useState(isAll ? DEFAULT_JOURNAL_INDEX_LIMIT : value)

  const commit = (raw: string) => {
    const n = parseInt(raw, 10)
    if (Number.isNaN(n) || n < 1) {
      onChange(lastCount) // empty / invalid → keep the last good value
      return
    }
    setLastCount(n)
    onChange(n)
  }

  return (
    <div className="flex items-center" style={{ gap: 14 }}>
      <input
        type="number"
        min={1}
        step={1}
        key={isAll ? 'all' : value}
        defaultValue={isAll ? '' : String(value)}
        disabled={isAll}
        placeholder={isAll ? 'All' : undefined}
        onBlur={(e) => commit(e.target.value)}
        style={{ ...inputStyle, opacity: isAll ? 0.5 : 1, cursor: isAll ? 'not-allowed' : 'text' }}
      />
      <label
        className="flex items-center"
        style={{ gap: 6, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={isAll}
          onChange={(e) => onChange(e.target.checked ? 0 : lastCount)}
          style={{ cursor: 'pointer' }}
        />
        All
      </label>
    </div>
  )
}

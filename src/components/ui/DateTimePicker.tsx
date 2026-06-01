import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'

interface DateTimePickerProps {
  /** Current value as an ISO timestamp string. */
  value: string
  /** Called with a new ISO timestamp whenever the date or time changes. */
  onChange: (iso: string) => void
}

/**
 * Inline date + time editor for entry metadata. Resting state renders the
 * formatted date as a subtle sage text button (matching the old static
 * display); clicking it opens a popover with a calendar (react-day-picker) for
 * the date and a native `<input type="time">` for the time. Both controls only
 * ever produce valid values, so the stored ISO string can never be malformed.
 *
 * The popover renders into a portal at document.body with `position: fixed` so
 * it escapes the editor's scroll/overflow ancestors — same approach as
 * HelpTooltip. It opens below the trigger and clamps to the right viewport edge.
 *
 * Timezone: all conversions use local wall-clock getters/setters and local
 * `Date` construction, then `toISOString()` to store. `format(new Date(iso))`
 * renders in local time. No `Z` is appended manually and no UTC getters are
 * used, so the round-trip preserves the user's intended instant.
 */
export function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const date = new Date(value)

  // Combine a freshly picked day with the current time-of-day so changing the
  // date never resets the clock the user already set.
  const commitDate = (day: Date) => {
    const combined = new Date(
      day.getFullYear(), day.getMonth(), day.getDate(),
      date.getHours(), date.getMinutes(), 0, 0,
    )
    onChange(combined.toISOString())
  }

  // Combine a new time with the current calendar day. Guards empty/invalid
  // input so clearing the field never wipes the stored date.
  const commitTime = (hhmm: string) => {
    if (!hhmm) return
    const [h, m] = hhmm.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return
    const next = new Date(value)
    next.setHours(h, m, 0, 0)
    onChange(next.toISOString())
  }

  // Position the popover under the trigger, shifting left if it would overflow
  // the right edge. Runs before paint (same approach as HelpTooltip). The date
  // sits high in the editor, so there's always room to open downward.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const btn = buttonRef.current.getBoundingClientRect()
    const pop = popoverRef.current?.getBoundingClientRect()
    const popWidth = pop?.width ?? 320
    const margin = 8
    let left = btn.left
    if (left + popWidth + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - popWidth - margin)
    }
    setPosition({ top: btn.bottom + 6, left })
  }, [open])

  // Outside-click and Escape close the popover. Both refs are checked so
  // interacting inside the calendar doesn't dismiss it.
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Edit entry date and time"
        onClick={() => setOpen((o) => !o)}
        style={{
          fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)',
          background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer', textAlign: 'left',
          transition: 'color var(--transition-gentle)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--forest)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--sage)')}
      >
        {format(date, 'd MMMM yyyy · EEEE · h:mm a')}
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Choose entry date and time"
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            visibility: position ? 'visible' : 'hidden',
            background: 'var(--parchment)',
            color: 'var(--ink)',
            border: '1px solid var(--stone)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 32px var(--shadow-warm-deep)',
            padding: 12,
            zIndex: 9999,
          }}
        >
          <DayPicker
            className="nopy-rdp"
            mode="single"
            required
            selected={date}
            defaultMonth={date}
            onSelect={(day) => commitDate(day)}
          />
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              borderTop: '1px solid var(--stone)',
              paddingTop: 10, marginTop: 4,
            }}
          >
            <label
              htmlFor="entry-time"
              style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)' }}
            >
              Time
            </label>
            <input
              id="entry-time"
              type="time"
              aria-label="Entry time"
              value={format(date, 'HH:mm')}
              onChange={(e) => commitTime(e.target.value)}
              style={{
                fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)',
                background: 'transparent', border: '1px solid var(--stone)',
                borderRadius: 'var(--radius-sm)', padding: '4px 8px',
                colorScheme: 'light dark', outline: 'none',
              }}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

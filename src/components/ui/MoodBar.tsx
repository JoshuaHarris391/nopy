import { getMoodColor, moodValueToLabel } from '../../utils/mood'

interface MoodBarProps {
  value: number | null
  onChange: (value: number) => void
}

export function MoodBar({ value, onChange }: MoodBarProps) {
  return (
    <div className="flex items-center gap-0" style={{ padding: '12px 0 4px' }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--sage)', marginRight: 12, flexShrink: 0 }}>
        Mood
      </span>
      <div className="flex items-center flex-1" style={{ position: 'relative', maxWidth: 320 }}>
        {/* Connecting line */}
        <div
          className="absolute"
          style={{
            left: 10,
            right: 10,
            top: '50%',
            height: 2,
            background: 'var(--stone)',
            transform: 'translateY(-50%)',
            borderRadius: 1,
          }}
        />
        {/* Dots */}
        <div className="flex items-center justify-between w-full relative">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => {
            const isSelected = value === v
            const color = getMoodColor(v)
            return (
              <button
                key={v}
                onClick={() => onChange(v)}
                className="relative cursor-pointer flex items-center justify-center group"
                style={{
                  width: isSelected ? 22 : 14,
                  height: isSelected ? 22 : 14,
                  borderRadius: '50%',
                  background: isSelected ? color : `color-mix(in srgb, ${color} 30%, var(--warm-cream))`,
                  border: `2px solid ${isSelected ? color : `color-mix(in srgb, ${color} 50%, var(--stone))`}`,
                  transition: 'all var(--transition-gentle)',
                  zIndex: 1,
                  padding: 0,
                  boxShadow: isSelected ? `0 0 0 3px ${color}33` : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.width = '25px'
                    e.currentTarget.style.height = '25px'
                    e.currentTarget.style.background = `color-mix(in srgb, ${color} 55%, var(--warm-cream))`
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.width = '14px'
                    e.currentTarget.style.height = '14px'
                    e.currentTarget.style.background = `color-mix(in srgb, ${color} 30%, var(--warm-cream))`
                  }
                }}
                title={`${v}/10 — ${moodValueToLabel(v)}`}
              >
                {isSelected && (
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 8, fontWeight: 700, color: 'white', lineHeight: 1 }}>
                    {v}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      {value && (
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: getMoodColor(value), marginLeft: 12, flexShrink: 0, fontWeight: 500 }}>
          {value}/10
        </span>
      )}
    </div>
  )
}

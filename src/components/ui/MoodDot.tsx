import type { MoodScore } from '../../types/journal'

const moodColors: Record<string, string> = {
  great: 'var(--gentle-green)',
  good: 'var(--sage)',
  neutral: 'var(--dusk-blue)',
  mixed: 'var(--amber)',
  low: 'var(--soft-coral)',
}

function moodColorFromValue(value: number): string {
  if (value >= 9) return moodColors.great
  if (value >= 7) return moodColors.good
  if (value >= 5) return moodColors.neutral
  if (value >= 3) return moodColors.mixed
  return moodColors.low
}

interface MoodDotProps {
  mood: MoodScore | null
}

export function MoodDot({ mood }: MoodDotProps) {
  if (!mood) return null
  const color = mood.label ? moodColors[mood.label] ?? moodColors.neutral : moodColorFromValue(mood.value)
  return (
    <div
      className="flex-shrink-0 rounded-full"
      style={{
        width: 8,
        height: 8,
        background: color,
      }}
    />
  )
}

import type { MoodScore } from '../../types/journal'

const moodColors: Record<string, string> = {
  great: 'var(--sunlight)',
  good: 'var(--gentle-green)',
  neutral: 'var(--dusk-blue)',
  mixed: 'var(--dusk-blue)',
  low: 'var(--soft-coral)',
}

function moodColorFromValue(value: number): string {
  if (value >= 8) return moodColors.great
  if (value >= 6) return moodColors.good
  if (value >= 4) return moodColors.neutral
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

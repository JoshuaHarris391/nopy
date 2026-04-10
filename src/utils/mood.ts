import type { MoodLabel } from '../types/journal'

const labels: MoodLabel[] = ['low', 'mixed', 'neutral', 'good', 'great']

export function moodValueToLabel(value: number): MoodLabel {
  if (value >= 9) return 'great'
  if (value >= 7) return 'good'
  if (value >= 5) return 'neutral'
  if (value >= 3) return 'mixed'
  return 'low'
}

export const moodLabelColors: Record<MoodLabel, string> = {
  great: 'var(--gentle-green)',
  good: 'var(--sage)',
  neutral: 'var(--dusk-blue)',
  mixed: 'var(--amber)',
  low: 'var(--soft-coral)',
}

export function getMoodColor(value: number): string {
  return moodLabelColors[moodValueToLabel(value)]
}

export { labels as moodLabels }

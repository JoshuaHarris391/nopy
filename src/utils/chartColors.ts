import type { StateKey } from '../types/journal'

/**
 * Categorical chart colours. The eight slots are the validated reference
 * palette (CVD-separable, chroma floor, lightness band, contrast) checked
 * against both app surfaces; the hex values live in index.css as
 * --chart-1..8 with their own dark-mode steps. Hues are assigned in fixed
 * order and never cycled: a ninth category folds into "other".
 */
export const CHART_PALETTE = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)',
] as const

export const OTHER_COLOR = 'var(--chart-other)'
export const OTHER_KEY = 'other'

/** Colour follows the entity: a state keeps its hue in every window. */
export const STATE_COLORS: Record<StateKey, string> = {
  anxiety: 'var(--chart-8)',       // red
  irritability: 'var(--chart-2)',  // orange
  sadness: 'var(--chart-1)',       // blue
  calm: 'var(--chart-3)',          // aqua
  agency: 'var(--chart-4)',        // yellow
  connection: 'var(--chart-5)',    // magenta
  meaning: 'var(--chart-7)',       // violet
}

/** Frequency-ordered categories take palette slots in order; "other" is always grey. */
export function assignColors(categories: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  let slot = 0
  for (const c of categories) {
    if (c === OTHER_KEY) { out[c] = OTHER_COLOR; continue }
    out[c] = CHART_PALETTE[Math.min(slot, CHART_PALETTE.length - 1)]
    slot++
  }
  return out
}

/**
 * Heatmap cell colour for a magnitude fraction 0..1: theme dusk blue (low)
 * through amber (middle) to soft coral (hot), blended with color-mix so it
 * follows the active theme's token values in light and dark mode.
 */
export function heatRampColor(t: number): string {
  const f = Math.min(1, Math.max(0, t))
  if (f < 0.5) return `color-mix(in oklab, var(--dusk-blue), var(--amber) ${Math.round(f * 200)}%)`
  return `color-mix(in oklab, var(--amber), var(--soft-coral) ${Math.round((f - 0.5) * 200)}%)`
}

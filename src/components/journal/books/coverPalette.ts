export type ClothName = 'forest' | 'bark' | 'amber' | 'dusk' | 'sage'

const ROTATION: ClothName[] = ['forest', 'bark', 'amber', 'dusk', 'sage']

export interface CoverTheme {
  name: ClothName
  /** Board colour. */
  cloth: string
  /** Darker band along the hinge. */
  spine: string
  /** Which type colour sits legibly on this cloth. */
  tone: 'light' | 'ink'
  text: string
  /** text-shadow that presses the year into the board. */
  deboss: string
}

export function clothForYear(year: number): ClothName {
  return ROTATION[((year % 5) + 5) % 5]
}

export function coverThemeForYear(year: number): CoverTheme {
  const name = clothForYear(year)
  const cloth = `var(--cloth-${name})`
  const tone: CoverTheme['tone'] = name === 'amber' ? 'ink' : 'light'
  return {
    name,
    cloth,
    tone,
    spine: `color-mix(in srgb, ${cloth} 76%, var(--cloth-ink))`,
    text: tone === 'light' ? 'rgba(245, 240, 232, 0.9)' : 'var(--cloth-ink)',
    // Shadow along the top edge, faint highlight along the bottom.
    // Ink-tinted rgba, never pure black.
    deboss: tone === 'light'
      ? '0 -1px 0 rgba(44, 62, 44, 0.45), 0 1px 0 rgba(245, 240, 232, 0.16)'
      : '0 -1px 0 rgba(44, 62, 44, 0.28), 0 1px 0 rgba(255, 255, 255, 0.35)',
  }
}

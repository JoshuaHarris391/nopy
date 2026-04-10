import { describe, it, expect } from 'vitest'
import { moodValueToLabel, getMoodColor, moodLabelColors, moodLabels } from '../../utils/mood'

describe('moodValueToLabel', () => {
  it.each([
    [1, 'low'], [2, 'low'],
    [3, 'mixed'], [4, 'mixed'],
    [5, 'neutral'], [6, 'neutral'],
    [7, 'good'], [8, 'good'],
    [9, 'great'], [10, 'great'],
  ])('maps %i to "%s"', (value, expected) => {
    expect(moodValueToLabel(value)).toBe(expected)
  })

  it('clamps values below 1 to "low"', () => {
    expect(moodValueToLabel(-5)).toBe('low')
    expect(moodValueToLabel(0)).toBe('low')
  })

  it('clamps values above 10 to "great"', () => {
    expect(moodValueToLabel(15)).toBe('great')
  })
})

describe('getMoodColor', () => {
  it('returns a CSS variable string for each mood value', () => {
    for (let v = 1; v <= 10; v++) {
      const color = getMoodColor(v)
      expect(color).toMatch(/^var\(--/)
    }
  })
})

describe('moodLabelColors', () => {
  it('has an entry for every label in moodLabels', () => {
    for (const label of moodLabels) {
      expect(moodLabelColors[label]).toBeDefined()
    }
  })
})

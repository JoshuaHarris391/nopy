# 04 — Extract Mood Helpers and `ui/MoodBar`

## Problem

The mood-to-label and mood-to-color mappings are copy-pasted across three files:

- `src/components/journal/EntryEditor.tsx:18-24` — `moodValueToLabel`, `getMoodColor`
- `src/components/profile/MoodTimeline.tsx:9-24` — `moodValueToLabel`, `getMoodColor` (with a slightly different color palette)
- `src/components/profile/ProfileView.tsx:24-30` — `moodLabelColors`

The three copies have already drifted — `MoodTimeline` and `EntryEditor` use subtly different color values for the same mood score. There is no single source of truth, so any future adjustment (tweaking the color palette, adding a new mood level, fixing an accessibility contrast issue) has to be repeated in three places and verified by eye.

On top of the helpers, the `MoodBar` component at `EntryEditor.tsx:26-100` is a good, self-contained piece of UI — a segmented bar the user clicks to set their mood — but it is declared inside `EntryEditor.tsx` and not reusable. The profile page has no way to render the same control for demographic mood display.

## Current Behaviour

### `EntryEditor.tsx:18-24`

```typescript
const moodLabels = ['awful', 'bad', 'meh', 'okay', 'neutral', 'fine', 'good', 'great', 'amazing', 'euphoric'] as const
export function moodValueToLabel(value: number): MoodLabel {
  return moodLabels[Math.max(0, Math.min(9, value - 1))]
}
export function getMoodColor(value: number): string {
  // ...hardcoded hex values, one copy
}
```

### `MoodTimeline.tsx:9-24`

A near-identical `moodValueToLabel` plus a different `getMoodColor` with slightly different hex values for mid-range moods.

### `ProfileView.tsx:24-30`

```typescript
const moodLabelColors: Record<MoodLabel, string> = { /* third independent copy */ }
```

### `EntryEditor.tsx:26-100` — inline `MoodBar`

About 75 lines of JSX + state for the segmented mood picker, living inline in the editor file. Not reusable.

## Desired Behaviour

- One `utils/mood.ts` exporting `moodValueToLabel`, `getMoodColor`, `moodLabelColors` — every consumer imports from there.
- One `components/ui/MoodBar.tsx` receiving `value`/`onChange` props — reusable for the editor, profile page, and any future mood-display surface.
- All three current copies deleted.
- Unit tests for the pure helpers covering all 10 mood values plus boundary/invalid inputs.

## Implementation Steps

### 1. Create `src/utils/mood.ts`

```typescript
import type { MoodLabel } from '../types/journal'

export const moodLabels: readonly MoodLabel[] = [
  'awful', 'bad', 'meh', 'okay', 'neutral',
  'fine', 'good', 'great', 'amazing', 'euphoric',
] as const

export function moodValueToLabel(value: number): MoodLabel {
  const clamped = Math.max(1, Math.min(10, Math.round(value)))
  return moodLabels[clamped - 1]
}

export const moodLabelColors: Record<MoodLabel, string> = {
  awful:    '#7a1f1f',
  bad:      '#a23a3a',
  meh:      '#b8823a',
  okay:     '#b8a23a',
  neutral:  '#8a8a8a',
  fine:     '#5a8a3a',
  good:     '#3a8a5a',
  great:    '#3a8a8a',
  amazing:  '#3a5a8a',
  euphoric: '#5a3a8a',
}

export function getMoodColor(value: number): string {
  return moodLabelColors[moodValueToLabel(value)]
}
```

Pick one set of hex values — audit the three current copies, pick the palette the team likes, and document that choice as the canonical one. (This is a subjective call — resolve by team preference before writing the doc.)

### 2. Create `src/components/ui/MoodBar.tsx`

Lift the current `MoodBar` declaration out of `EntryEditor.tsx:26-100`. Its props are:

```typescript
interface MoodBarProps {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
}
```

Internally it imports `moodLabels`, `moodValueToLabel`, and `getMoodColor` from `utils/mood.ts`. The component itself becomes a thin click-to-set grid of 10 segments.

### 3. Delete the three copies

- `EntryEditor.tsx:18-24` and `26-100` — delete; import from the new files.
- `MoodTimeline.tsx:9-24` — delete both helpers; import `getMoodColor` and `moodValueToLabel` from `utils/mood.ts`.
- `ProfileView.tsx:24-30` — delete `moodLabelColors` constant; import from `utils/mood.ts`.

### 4. Unit tests

Create `src/__tests__/utils/mood.test.ts` following the docstring convention. Test cases:

- `moodValueToLabel` for each value 1-10 (10 tests)
- `moodValueToLabel` with a value below 1 (clamps to 'awful')
- `moodValueToLabel` with a value above 10 (clamps to 'euphoric')
- `moodValueToLabel` with a fractional value (rounds then clamps)
- `getMoodColor` for each label (smoke test that it returns a valid hex)
- `moodLabelColors` has an entry for every label in `moodLabels` (guards against future drift when a new label is added)

## Files to Modify

- **New**: `src/utils/mood.ts`
- **New**: `src/components/ui/MoodBar.tsx`
- **New**: `src/__tests__/utils/mood.test.ts`
- **Modify**: `src/components/journal/EntryEditor.tsx` — remove L18-24 and L26-100, import from the new files.
- **Modify**: `src/components/profile/MoodTimeline.tsx` — remove L9-24, import from `utils/mood.ts`.
- **Modify**: `src/components/profile/ProfileView.tsx` — remove L24-30, import from `utils/mood.ts`.

## Dependencies

None.

## Testing Notes

### Unit

Example test structure (every `it()` gets a docstring):

```ts
describe('moodValueToLabel', () => {
  it('maps 1 to "awful"', () => {
    /**
     * Mood values are stored as integers 1-10 in the database for range-query
     * friendliness, but the UI shows human-readable labels. The mapping is
     * a fixed 1:1 lookup — this test locks in the boundary values so a
     * future "add a new mood level" refactor will force an explicit change.
     * Input: 1
     * Expected output: 'awful'
     */
    expect(moodValueToLabel(1)).toBe('awful')
  })

  it('clamps values below 1 to "awful" instead of throwing', () => {
    /**
     * An AI response or corrupted file could produce a mood value outside
     * the expected range. Rather than crashing the renderer, the helper
     * clamps to the valid range. This test documents the contract so a
     * future "strict mode" refactor will know to update both the helper
     * and its schema peer (EntryMetadataCoercedSchema.mood.value.catch(5)).
     * Input: -5
     * Expected output: 'awful'
     */
    expect(moodValueToLabel(-5)).toBe('awful')
  })
})
```

### Manual

1. Open the editor, click each mood segment. Confirm the color matches the new palette consistently.
2. Open the profile page mood timeline. Confirm the bar colors match the editor exactly (previously they drifted).
3. Open the profile stats section. Confirm the mood distribution bars use the same palette.

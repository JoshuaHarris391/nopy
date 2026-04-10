# 06 — Split SettingsView into Sections and Primitives

## Problem

`src/components/settings/SettingsView.tsx` is 450 lines. The "label + description + control" row pattern is rewritten ~7 times with identical inline styles (L86-128, L175-214, L216-245, L247-277, L286-315, L319-344, L360-395). The delete confirmation modal at L411-447 is near-identical to the one in `EntryEditor.tsx:449-498`. The model-loading side effect at L63-73 mixes API concerns into a settings component.

Every time a new setting is added, the developer has to copy one of the existing row blocks, adjust field names, and hope the spacing/styling stays consistent. This is friction that discourages iteration.

## Current Behaviour

### Repeated row pattern (one of ~7 instances)

```typescript
// SettingsView.tsx — approximate structure at L86-128
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ... }}>
  <div>
    <div style={{ fontWeight: 600 }}>Label</div>
    <div style={{ fontSize: 13, color: '#999', ... }}>Description text</div>
  </div>
  <SomeControl value={...} onChange={...} />
</div>
```

### Duplicate delete modal — `SettingsView.tsx:411-447`

Nearly identical to `EntryEditor.tsx:449-498` — same backdrop, same two buttons ("Cancel" / "Delete Everything"), same inline styles. Only the text differs.

### Model-loading effect — `SettingsView.tsx:63-73`

```typescript
useEffect(() => {
  if (!apiKey) return
  setLoadingModels(true)
  fetchModels(apiKey)
    .then(setModels)
    .catch(console.error)
    .finally(() => setLoadingModels(false))
}, [apiKey])
```

This is API-call logic inside a settings view — it belongs in a hook.

## Desired Behaviour

```
src/components/settings/
  SettingsView.tsx              ← thin composition of sections (~60 lines)
  sections/
    AppearanceSection.tsx       ← theme, font size
    ApiSection.tsx              ← API key, model picker
    DataPrivacySection.tsx      ← journal path, privacy toggle
    MaintenanceSection.tsx      ← force update, reset data
src/components/ui/
  SettingsRow.tsx               ← shared "label + description + control" row
  SettingsSection.tsx           ← section wrapper with heading
  ConfirmDialog.tsx             ← (task 07)
  CancellableActionButton.tsx   ← (task 11)
src/hooks/
  useAnthropicModels.ts         ← model fetching
```

## Implementation Steps

### 1. Create `SettingsRow` and `SettingsSection` primitives

`src/components/ui/SettingsRow.tsx`:

```typescript
interface SettingsRowProps {
  label: string
  description?: string
  children: React.ReactNode
}
```

Renders the repeated "label + description on the left, control on the right" layout. One CSS pattern, used everywhere.

`src/components/ui/SettingsSection.tsx`:

```typescript
interface SettingsSectionProps {
  title: string
  children: React.ReactNode
}
```

Renders a section heading + container with consistent spacing.

### 2. Extract `useAnthropicModels`

Create `src/hooks/useAnthropicModels.ts`:

```typescript
export function useAnthropicModels(apiKey: string) {
  const [models, setModels] = useState<{ id: string; displayName: string }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!apiKey) { setModels([]); return }
    setLoading(true)
    fetchModels(apiKey)
      .then(setModels)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [apiKey])

  return { models, loading }
}
```

### 3. Split into section files

Each section file is a standalone component that receives props from the parent `SettingsView` (or reads from Zustand selectors directly). Each uses `SettingsRow` and `SettingsSection`.

- `AppearanceSection` — theme selector, font size control.
- `ApiSection` — API key input, model picker (uses `useAnthropicModels`).
- `DataPrivacySection` — journal path selector, data privacy toggle.
- `MaintenanceSection` — force-update button (uses `CancellableActionButton` from task 11), reset data (uses `ConfirmDialog` from task 07).

### 4. Slim down `SettingsView`

The root component becomes:

```typescript
export default function SettingsView() {
  return (
    <div>
      <MainHeader title="Settings" />
      <AppearanceSection />
      <ApiSection />
      <DataPrivacySection />
      <MaintenanceSection />
    </div>
  )
}
```

~60 lines or less.

## Files to Modify

- **New**: `src/components/ui/SettingsRow.tsx`
- **New**: `src/components/ui/SettingsSection.tsx`
- **New**: `src/hooks/useAnthropicModels.ts`
- **New**: `src/components/settings/sections/AppearanceSection.tsx`
- **New**: `src/components/settings/sections/ApiSection.tsx`
- **New**: `src/components/settings/sections/DataPrivacySection.tsx`
- **New**: `src/components/settings/sections/MaintenanceSection.tsx`
- **New**: `src/__tests__/hooks/useAnthropicModels.test.ts`
- **Modify**: `src/components/settings/SettingsView.tsx` — replace with thin composition.

## Dependencies

- **07** — `ConfirmDialog` for the delete-all-data modal.
- **11** — `CancellableActionButton` for the force-update button.
- **13** — test infrastructure for `renderHook`.

## Testing Notes

### Unit

`src/__tests__/hooks/useAnthropicModels.test.ts`:

```ts
describe('useAnthropicModels', () => {
  it('fetches models when apiKey is provided', () => {
    /**
     * The hook wraps the fetchModels API call so the settings view does not
     * contain fetch logic inline. This test mocks fetchModels and verifies
     * the hook calls it with the provided key.
     * Input: renderHook with apiKey = 'test-key'
     * Expected output: fetchModels called with 'test-key', models populated
     */
  })

  it('clears models when apiKey is empty', () => {
    /**
     * When the user deletes their API key, the model picker should empty out
     * rather than showing stale results from the previous key.
     * Input: renderHook with apiKey = '', after previously having models
     * Expected output: models === [], loading === false
     */
  })
})
```

### Manual

1. Open Settings. Confirm all sections render identically to before.
2. Change the API key. The model list should update.
3. Click "Delete All Data". Confirm the `ConfirmDialog` appears.
4. Click "Force Reprocess". Confirm the cancellable button shows progress.

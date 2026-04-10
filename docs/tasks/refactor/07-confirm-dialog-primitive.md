# 07 — Extract Shared `ConfirmDialog` Primitive

## Problem

The delete confirmation modal is reproduced near-verbatim in two places:

- `src/components/journal/EntryEditor.tsx:449-498` — "Delete this entry?"
- `src/components/settings/SettingsView.tsx:411-447` — "Delete all data?"

Both are hand-rolled inline modals with the same backdrop, positioning, button layout, and close-on-Escape logic. Neither has `role="dialog"`, `aria-modal`, or a focus trap — pressing Tab while the modal is open moves focus behind the backdrop.

Additionally, the danger button in `EntryEditor.tsx:477-494` is a raw `<button>` with inline red styles, even though `src/components/ui/Button.tsx` exists (supporting `primary` and `secondary` variants). The Button primitive should gain a `danger` variant so both modals and future destructive actions share one styled component.

## Current Behaviour

### `EntryEditor.tsx:449-498` — inline delete modal

```typescript
{showDeleteModal && (
  <div style={{ position: 'fixed', inset: 0, ... /* backdrop */ }}>
    <div style={{ /* modal box */ }}>
      <h3>Delete this entry?</h3>
      <p>This cannot be undone.</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => setShowDeleteModal(false)}>Cancel</button>
        <button onClick={handleDelete} style={{ background: '#c0392b', color: 'white' }}>
          Delete
        </button>
      </div>
    </div>
  </div>
)}
```

### `SettingsView.tsx:411-447` — near-identical

Same backdrop, same layout, different text and handler. The "danger" button uses inline styles instead of the `Button` component.

### `Button.tsx:1-43` — missing `danger` variant

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary'
  // ...
}
```

No `danger` option — forces every destructive action to hand-roll red button styles.

## Desired Behaviour

- One `ConfirmDialog` component in `src/components/ui/ConfirmDialog.tsx`.
- A `danger` variant added to `Button.tsx`.
- Both call sites replaced.
- The dialog is accessible: `role="dialog"`, `aria-modal="true"`, focus trap on open, focus restore on close, Escape to cancel.

## Implementation Steps

### 1. Add `danger` variant to `Button`

In `src/components/ui/Button.tsx`, extend the variant type:

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger'
  // ...
}
```

Add a style case for `danger` using the same `#c0392b` red that both modals currently inline.

### 2. Create `ConfirmDialog`

`src/components/ui/ConfirmDialog.tsx`:

```typescript
interface ConfirmDialogProps {
  open: boolean
  title: string
  body: string
  confirmLabel?: string    // default: "Delete"
  danger?: boolean         // default: true
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, body, confirmLabel = 'Delete', danger = true, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Focus trap: on open, focus the cancel button; trap Tab within the modal
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    confirmRef.current?.focus()
    return () => prev?.focus()
  }, [open])

  // Escape to cancel
  useKeyboardShortcut('escape', onCancel)    // from task 02

  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ /* backdrop */ }}>
      <div style={{ /* modal box */ }}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button ref={confirmRef} variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

### 3. Replace both call sites

**`EntryEditor.tsx:449-498`** → replace with:

```typescript
<ConfirmDialog
  open={showDeleteModal}
  title="Delete this entry?"
  body="This cannot be undone."
  onConfirm={handleDelete}
  onCancel={() => setShowDeleteModal(false)}
/>
```

**`SettingsView.tsx:411-447`** → same pattern with "Delete all data?" text.

## Files to Modify

- **New**: `src/components/ui/ConfirmDialog.tsx`
- **New**: `src/__tests__/components/ui/ConfirmDialog.test.tsx`
- **Modify**: `src/components/ui/Button.tsx` — add `danger` variant.
- **Modify**: `src/components/journal/EntryEditor.tsx` — replace inline modal with `ConfirmDialog`.
- **Modify**: `src/components/settings/SettingsView.tsx` — replace inline modal with `ConfirmDialog`.

## Dependencies

- **02** — `useKeyboardShortcut` for Escape handling (or inline the `useEffect` if you want this task to land independently).
- **13** — test infrastructure for RTL.

## Testing Notes

### Unit

`src/__tests__/components/ui/ConfirmDialog.test.tsx`:

```ts
describe('ConfirmDialog', () => {
  it('renders the title and body when open is true', () => {
    /**
     * The dialog is the only confirmation UI in the app. If it doesn't
     * render the provided text, the user has no idea what they're confirming.
     * Input: render(<ConfirmDialog open title="Delete?" body="Gone forever" ... />)
     * Expected output: "Delete?" and "Gone forever" visible in the document
     */
  })

  it('does not render anything when open is false', () => {
    /**
     * Mounting a hidden dialog into the DOM wastes layout and risks focus
     * issues (screen readers may announce it). When closed, the component
     * must return null.
     * Input: render(<ConfirmDialog open={false} ... />)
     * Expected output: nothing in the document
     */
  })

  it('calls onConfirm when the confirm button is clicked', () => {
    /**
     * The primary action (e.g. "Delete") must call the provided handler.
     * Input: click the confirm button
     * Expected output: onConfirm called once
     */
  })

  it('calls onCancel when the cancel button is clicked', () => {
    /**
     * The secondary action must dismiss the dialog without side effects.
     * Input: click the "Cancel" button
     * Expected output: onCancel called once
     */
  })

  it('calls onCancel when Escape is pressed', () => {
    /**
     * Escape is the standard keyboard shortcut for dismissing modals. Users
     * expect it, and accessibility guidelines (WCAG 2.1 SC 1.3.1) recommend
     * it for dialog patterns.
     * Input: press Escape while dialog is open
     * Expected output: onCancel called once
     */
  })

  it('traps focus within the dialog when open', () => {
    /**
     * Without a focus trap, pressing Tab moves focus behind the backdrop to
     * invisible elements, which is disorienting and a WCAG failure. This
     * test verifies that Tab cycles between the two buttons.
     * Input: open dialog, press Tab repeatedly
     * Expected output: focus stays within the dialog
     */
  })
})
```

### Manual

1. Open the editor, click the delete icon. The `ConfirmDialog` should appear.
2. Press Escape. The dialog should close.
3. Reopen and Tab through — focus should cycle between Cancel and Delete buttons only.
4. Click Delete. The entry should be removed.
5. Repeat in Settings with "Delete All Data".

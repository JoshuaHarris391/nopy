# Components and Hooks

The UI building blocks: shared primitives, custom hooks, and component organization guidelines.

**Contents**

- [UI primitives](#ui-primitives) — reusable components in `src/components/ui/`
- [Custom hooks](#custom-hooks) — reusable logic in `src/hooks/`
- [View components](#view-components) — page-level components
- [Guidelines](#guidelines) — when to extract, how to size files

---

## UI primitives

All shared presentational components live in `src/components/ui/`. These are small, stateless (or minimally stateful), and reusable across views.

| Component | File | Props | Purpose |
|---|---|---|---|
| `Button` | `Button.tsx` | `variant: 'primary' \| 'secondary' \| 'danger'`, `onClick`, `disabled`, `children` | Standard button with three visual variants |
| `MoodDot` | `MoodDot.tsx` | `value: number` | Colored circle indicating mood level |
| `ProgressBar` | `ProgressBar.tsx` | `current: number`, `total: number` | Horizontal progress indicator |
| `EmptyState` | `EmptyState.tsx` | `title: string`, `description: string` | Centered message for empty views |
| `MainHeader` | `MainHeader.tsx` | `title: string`, `actions?: ReactNode` | Page-level header bar |
| `Tag` | `Tag.tsx` | `label: string` | Inline tag chip |
| `MoodBar` | `MoodBar.tsx` | `value: number \| null`, `onChange: (v: number \| null) => void` | 10-segment mood picker |
| `ConfirmDialog` | `ConfirmDialog.tsx` | `open`, `title`, `body`, `confirmLabel`, `danger`, `onConfirm`, `onCancel` | Accessible confirmation modal with focus trap |
| `SettingsRow` | `SettingsRow.tsx` | `label`, `description?`, `children` | "Label + description + control" row for settings |
| `SettingsSection` | `SettingsSection.tsx` | `title`, `children` | Section wrapper with heading for settings |
| `CancellableActionButton` | `CancellableActionButton.tsx` | `state`, `progress`, `result`, `error`, `idleLabel`, `onRun`, `onAbort` | Button that shows progress and a "Stop" hover state |

When adding a new UI element that will appear in more than one view, create it here rather than inlining it.

---

## Custom hooks

All custom hooks live in `src/hooks/`. Each hook encapsulates a single reusable behavior.

| Hook | File | Parameters | Returns | Purpose |
|---|---|---|---|---|
| `useKeyboardShortcut` | `useKeyboardShortcut.ts` | `shortcut: 'mod+s' \| 'mod+enter' \| 'escape'`, `handler: () => void` | `void` | Bind a keyboard shortcut with a ref-stable handler (no re-registration on handler change) |
| `useAutosave` | `useAutosave.ts` | `save: () => Promise<void>`, `deps: unknown[]`, `delay?: number` | `{ dirty, markDirty, markClean }` | Debounced autosave with dirty tracking |
| `useAutoResizeTextarea` | `useAutoResizeTextarea.ts` | `ref: RefObject<HTMLTextAreaElement>`, `content: string`, `fontSize: number` | `{ resize: () => void }` | Auto-resize a textarea to fit its content |
| `useAnthropicModels` | `useAnthropicModels.ts` | `apiKey: string` | `{ models, loading }` | Fetch available Claude models for the settings model picker |
| `useCancellableTask` | `useCancellableTask.ts` | `resultTimeout?: number` | `{ state, progress, result, error, run, abort }` | State machine for async tasks with AbortSignal support |

### When to create a hook

Create a custom hook when:

- The same `useEffect` / `useState` / `useRef` pattern appears in two or more components.
- A component has a block of logic (>15 lines) that is independent of the component's JSX.
- You want to test behavior without mounting a full component.

Don't create a hook for one-off effects or simple derived state — a `useMemo` inline is fine.

---

## View components

View components are page-level components rendered by the router. Each lives in a subdirectory of `src/components/`:

| View | Directory | Key files |
|---|---|---|
| Journal | `components/journal/` | `JournalView.tsx`, `EntryEditor.tsx`, `EntryCard.tsx`, `EditorToolbar.tsx` |
| Chat | `components/chat/` | `ChatView.tsx`, `ChatMessage.tsx`, `ChatInput.tsx`, `ChatSessionList.tsx`, `AgentAvatar.tsx` |
| Profile | `components/profile/` | `ProfileView.tsx`, `MoodTimeline.tsx`, `LeafCatcherGame.tsx` |
| Settings | `components/settings/` | `SettingsView.tsx`, `sections/AppearanceSection.tsx`, `sections/ApiSection.tsx`, `sections/DataPrivacySection.tsx`, `sections/MaintenanceSection.tsx` |
| Index | `components/index/` | `IndexView.tsx` |
| Sidebar | `components/sidebar/` | `Sidebar.tsx`, `BottomNav.tsx` |

---

## Guidelines

### File size

No component file should exceed ~300 lines. When a file grows past this:

1. **Extract hooks** — any `useEffect`/`useState` cluster that manages a distinct concern (autosave, keyboard shortcuts, resize, API calls) should become a hook in `src/hooks/`.
2. **Extract sub-components** — any JSX block with its own state or conditional rendering should become a named component in the same directory.
3. **Extract UI primitives** — any UI pattern used in more than one view belongs in `src/components/ui/`.

### Store access

Components read from stores via **selectors**, not full destructure:

```typescript
// Good — subscribes only to entries
const entries = useJournalStore(s => s.entries)

// Bad — re-renders on every store change
const { entries, forceProgress, ... } = useJournalStore()
```

Action references (functions returned by the store) are stable and don't cause re-renders, so they can be selected individually.

### Accessibility minimums

- Every icon-only button needs `aria-label`.
- Modal dialogs need `role="dialog"`, `aria-modal="true"`, and a focus trap.
- Interactive elements must be keyboard-reachable (no `onClick` on `<div>` without `role="button"` and `tabIndex`).

---

## File reference

| Concern | File |
|---|---|
| UI primitives | `src/components/ui/*.tsx` |
| Custom hooks | `src/hooks/*.ts` |
| Router setup | `src/App.tsx` |
| App shell layout | `src/app/AppShell.tsx` |

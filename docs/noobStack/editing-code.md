# Editing Code

How to modify components, add new views, manage state, and change styles in this project.

## The Development Loop

1. Run `npm run dev` to start the dev server
2. Open `http://localhost:5173` in your browser
3. Edit a file in `src/` and save — the browser updates automatically
4. Repeat

This is your inner loop. Keep the dev server running while you work.

## Modifying a Component

Components live in `src/components/` and are `.tsx` files (TypeScript + JSX). Each feature folder contains the components for that feature.

1. Find the component you want to change (e.g. `src/components/journal/EntryCard.tsx`)
2. Find the `return (...)` block — this is the JSX (HTML-like syntax) that defines what the component renders
3. Edit the JSX content or Tailwind classes
4. Save — browser updates

## Creating a New Component

In React, the UI is built from small reusable pieces called **components**. Think of them like Python functions that return UI instead of data.

### Steps

1. Create a new file, e.g. `src/components/ui/Badge.tsx`:

```tsx
interface BadgeProps {
  label: string
  variant?: 'info' | 'warning' | 'success'
}

function Badge({ label, variant = 'info' }: BadgeProps) {
  const colors = {
    info: 'bg-blue-100 text-blue-800',
    warning: 'bg-yellow-100 text-yellow-800',
    success: 'bg-green-100 text-green-800',
  }

  return (
    <span className={`px-2 py-1 rounded text-sm ${colors[variant]}`}>
      {label}
    </span>
  )
}

export default Badge
```

2. Import and use it in any component:

```tsx
import Badge from '../ui/Badge'

function SomeView() {
  return <Badge label="New" variant="success" />
}
```

### Python Analogy

```python
# Python equivalent of the concept
def badge(label: str, variant: str = "info") -> str:
    colors = {"info": "blue", "warning": "yellow", "success": "green"}
    return f'<span class="{colors[variant]}">{label}</span>'
```

Components are just functions that return UI markup. The `export default` is like making a function importable from another module.

## How Routing Works

The app uses **react-router-dom** to map URLs to view components. This is configured in `App.tsx`.

### Python Analogy

```python
# Flask
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/journal")
def journal():
    return render_template("journal.html")

@app.route("/journal/<entry_id>")
def journal_entry(entry_id):
    return render_template("entry.html", entry_id=entry_id)
```

```tsx
// React Router (in App.tsx)
<Routes>
  <Route path="/" element={<IndexView />} />
  <Route path="/journal" element={<JournalView />} />
  <Route path="/journal/:entryId" element={<EntryEditor />} />
</Routes>
```

### Key Pieces

| React Router | Flask Equivalent | What It Does |
|---|---|---|
| `<Routes>` / `<Route>` | `@app.route(...)` | Maps URL paths to components |
| `<NavLink to="/journal">` | `<a href="{{ url_for('journal') }}">` | Clickable link that navigates without full page reload |
| `useParams()` | `request.view_args` | Read URL parameters (e.g. `:entryId`) |
| `useNavigate()` | `redirect()` | Programmatically go to a different page |

### Adding a New View / Page

1. **Create the view component** in a new feature folder:

```tsx
// src/components/analytics/AnalyticsView.tsx
function AnalyticsView() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <p>Your mood trends will appear here.</p>
    </div>
  )
}

export default AnalyticsView
```

2. **Add a route** in `App.tsx`:

```tsx
import AnalyticsView from './components/analytics/AnalyticsView'

// Inside the <Routes> block:
<Route path="/analytics" element={<AnalyticsView />} />
```

3. **Add navigation** — add a link in the sidebar (`src/components/sidebar/`):

```tsx
<NavLink to="/analytics">Analytics</NavLink>
```

That's it. The URL `/analytics` now renders your new view inside the AppShell layout.

## How Zustand Stores Work

Zustand is the state management library. Stores hold global state that any component can access.

### Python Analogy

```python
# Imagine a global dictionary that magically re-runs any function reading from it
# when a value changes. That's Zustand.

state = {"entries": [], "selected_id": None}

def add_entry(entry):
    state["entries"].append(entry)
    # All UI reading state["entries"] automatically updates
```

### Creating a Store

```tsx
// src/stores/useAnalyticsStore.ts
import { create } from 'zustand'

interface AnalyticsState {
  dateRange: 'week' | 'month' | 'year'
  setDateRange: (range: 'week' | 'month' | 'year') => void
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  dateRange: 'week',
  setDateRange: (range) => set({ dateRange: range }),
}))
```

### Using a Store in a Component

```tsx
import { useAnalyticsStore } from '../../stores/useAnalyticsStore'

function DateRangePicker() {
  const dateRange = useAnalyticsStore((s) => s.dateRange)
  const setDateRange = useAnalyticsStore((s) => s.setDateRange)

  return (
    <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
      <option value="week">Week</option>
      <option value="month">Month</option>
      <option value="year">Year</option>
    </select>
  )
}
```

The component re-renders automatically whenever `dateRange` changes — no matter which component changed it.

## Changing Styles with Tailwind

### Tailwind Utility Classes

Instead of writing CSS in a separate file, you apply small utility classes directly on elements:

```tsx
<div className="flex items-center gap-4 p-6 bg-white rounded-lg shadow">
  <h2 className="text-xl font-semibold text-gray-900">Title</h2>
  <p className="text-sm text-gray-500">Subtitle</p>
</div>
```

**Python analogy:** It's like using pre-built helper functions (`pad(6)`, `bold()`, `color("gray-900")`) instead of writing a custom formatting function each time.

### Common Tailwind Patterns

| What You Want | Tailwind Classes | CSS Equivalent |
|---|---|---|
| Horizontal layout | `flex items-center gap-4` | `display: flex; align-items: center; gap: 1rem` |
| Padding | `p-4` (all sides), `px-4` (horizontal), `py-2` (vertical) | `padding: 1rem` |
| Rounded corners | `rounded`, `rounded-lg`, `rounded-full` | `border-radius: ...` |
| Hover effect | `hover:bg-blue-600` | `.btn:hover { background: ... }` |
| Responsive | `md:flex-row` (applies at medium screens+) | `@media (min-width: 768px) { ... }` |
| Dark mode | `dark:bg-gray-800` | `@media (prefers-color-scheme: dark) { ... }` |

### CSS Custom Properties

The app also uses CSS custom properties (variables) in `index.css` for theming — colours, spacing values, etc. that Tailwind classes reference. You can see these at the top of `index.css`.

```css
/* In index.css */
:root {
  --color-primary: #6366f1;
}
```

```tsx
{/* Referenced in JSX via Tailwind's arbitrary value syntax */}
<div className="text-[var(--color-primary)]">Themed text</div>
```

## The Anthropic Service Layer

API calls to Claude are handled in `src/services/`. The structure:

- **`src/services/`** — Functions that call the Anthropic SDK (streaming chat completions, etc.)
- **`src/services/prompts/`** — System prompt templates used for AI features

The service layer is called by stores or components, never the other way around. A typical flow:

```
User sends message → ChatView calls store action → Store calls service →
Service streams Anthropic API response → Store updates state → ChatView re-renders
```

**Python analogy:** The services folder is like a `client.py` module that wraps an API client (`anthropic.Anthropic()`), and the prompts folder is like a `templates/` directory with your prompt strings.

## Common Gotchas

| Gotcha | Explanation |
|--------|-------------|
| `className` not `class` | In JSX, HTML's `class` attribute is written as `className` |
| Self-closing tags | Tags like `<img>` must be written as `<img />` in JSX |
| Single root element | A component's return must have one root element. Wrap siblings in `<div>` or `<>...</>` (fragment) |
| Curly braces for JS | Use `{variable}` inside JSX to embed JavaScript expressions |
| File must export | Other files can only import what you `export` — don't forget `export default` |
| Tailwind not applying | Make sure the class name is complete (not dynamically constructed from string concatenation) — Tailwind scans for full class names at build time |
| Store selector | Always use `useStore((s) => s.field)` not `useStore().field` — the selector form prevents unnecessary re-renders |

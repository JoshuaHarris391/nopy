# Core Concepts

Key React, TypeScript, and Vite concepts explained for someone who knows Python.

## TypeScript — "Python with Type Hints, but Enforced"

TypeScript is a superset of JavaScript that adds static types. If you use Python type hints (`def greet(name: str) -> str:`), TypeScript will feel familiar — except the compiler actually **enforces** them.

### Quick Comparison

| Python | TypeScript |
|--------|------------|
| `name: str = "Alice"` | `const name: string = "Alice"` |
| `def add(a: int, b: int) -> int:` | `function add(a: number, b: number): number {` |
| `items: list[str] = []` | `const items: string[] = []` |
| `data: dict[str, int] = {}` | `const data: Record<string, number> = {}` |
| `from module import func` | `import { func } from './module'` |

### Key Differences from Python

- **`const` / `let`** instead of just assigning. `const` = can't reassign (like `Final`), `let` = can reassign.
- **Semicolons** are optional but conventional.
- **Curly braces** `{}` instead of indentation for blocks.
- **`===`** for equality (not `==`, which does type coercion in JS).
- Files use `.ts` (plain TypeScript) or `.tsx` (TypeScript with JSX/React markup).

## React — "Functions That Return UI"

React is a library for building user interfaces from **components**. A component is just a function that returns markup.

### Python Mental Model

```python
# Imagine if Python had UI rendering:
def greeting(name: str) -> HTML:
    return f"<h1>Hello, {name}!</h1>"

# Usage:
greeting("Alice")  # → <h1>Hello, Alice!</h1>
```

In React (TypeScript):

```tsx
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>
}

// Usage in another component:
<Greeting name="Alice" />
```

### Props = Function Arguments

Components receive data through **props** (short for properties). Props are like function keyword arguments:

```python
# Python
def card(title: str, count: int):
    ...
```

```tsx
// React
function Card({ title, count }: { title: string; count: number }) {
  return <div><h2>{title}</h2><p>{count}</p></div>
}
```

### State = Mutable Variables That Trigger Re-renders

In Python, you mutate a variable and nothing else happens. In React, you use **state** — when state changes, the component re-renders (re-runs its function and updates the browser).

```tsx
import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)
  //     ↑ current value   ↑ setter function

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  )
}
```

**Python analogy:** Imagine a variable that, when you update it, automatically re-runs the function and refreshes the output — like a reactive cell in a Jupyter notebook.

## JSX — "HTML Inside JavaScript"

JSX lets you write HTML-like syntax directly in your TypeScript files. It's not real HTML — it gets compiled to function calls by the build tool.

```tsx
// This JSX:
<div className="card">
  <h1>Title</h1>
</div>

// Compiles to something like:
React.createElement('div', { className: 'card' },
  React.createElement('h1', null, 'Title')
)
```

You never write the compiled version. Just write JSX and the tooling handles the rest.

## Vite — "The Build Tool / Dev Server"

Vite is the tool that:

1. **Serves your code** during development with hot reload
2. **Bundles your code** for production into optimised files

### Python Analogy

| Vite Feature | Python Equivalent |
|--------------|-------------------|
| Dev server (`npm run dev`) | `flask run` or `uvicorn main:app --reload` |
| Hot Module Replacement | Auto-reload on file save |
| Production build (`npm run build`) | `pyinstaller` or `docker build` — packaging for deployment |
| `vite.config.ts` | `pyproject.toml` build config |

## npm — "pip for JavaScript"

| npm Command | Python Equivalent | What It Does |
|-------------|-------------------|--------------|
| `npm install` | `pip install -r requirements.txt` | Install all listed dependencies |
| `npm install <pkg>` | `pip install <pkg>` | Add a new dependency |
| `npm run <script>` | `make <target>` or a Makefile command | Run a named script from `package.json` |
| `package.json` | `requirements.txt` + `Makefile` | Dependency list + script definitions |
| `node_modules/` | `venv/lib/pythonX.Y/site-packages/` | Where installed packages live |
| `package-lock.json` | `pip freeze` output or `poetry.lock` | Exact pinned versions |

## Zustand — "A Global Dictionary That Updates the UI"

Zustand is the state management library used in this project. It lets you create shared state that any component can read from and write to.

### Python Analogy

Imagine a global dictionary where any module can read or update values, and any function that depends on a value automatically re-runs when that value changes:

```python
# Conceptual Python equivalent
state = {"count": 0, "entries": []}

def increment():
    state["count"] += 1
    # Every function "subscribed" to state["count"] re-runs automatically

# In Nopy, a Zustand store looks like:
# const useCountStore = create((set) => ({
#   count: 0,
#   increment: () => set((s) => ({ count: s.count + 1 })),
# }))
```

### Why Not Just Use React State?

React's built-in `useState` is local to one component. If multiple components need the same data (e.g. the journal entry list appears in the sidebar and the main view), you need shared state. Zustand provides that without the boilerplate of React Context.

**Python analogy:** `useState` is like a local variable inside a function. Zustand is like a module-level variable that multiple functions import.

## React Router — "Flask Routes for the Browser"

React Router maps URL paths to components, just like Flask maps URL paths to handler functions. The difference is that navigation happens entirely in the browser — no server round-trip.

### Python Analogy

```python
# Flask
@app.route("/")
def index(): return render_template("index.html")

@app.route("/journal/<entry_id>")
def entry(entry_id): return render_template("entry.html", id=entry_id)
```

```tsx
// React Router
<Route path="/" element={<IndexView />} />
<Route path="/journal/:entryId" element={<EntryEditor />} />
```

### Key Concepts

- **`<NavLink>`** — Like an `<a>` tag but it doesn't reload the page. It also adds an "active" class when the current URL matches, so you can highlight the current page in the sidebar.
- **`useParams()`** — Reads URL parameters. Like `request.view_args['entry_id']` in Flask.
- **`useNavigate()`** — Programmatic navigation. Like `return redirect('/journal')` in Flask.
- **Nested routes** — Routes can be nested inside a layout (AppShell), so the sidebar stays constant while the main content swaps out. Like Jinja template inheritance.

## Tailwind CSS — "Pre-built Utility Functions for Styling"

Tailwind is a CSS framework where you style elements by applying small, single-purpose utility classes directly in your markup.

### Python Analogy

Instead of writing a custom formatting function each time:

```python
# Traditional CSS approach — write custom styles
def format_card():
    return """
    .card { padding: 16px; background: white; border-radius: 8px; box-shadow: ... }
    """

# Tailwind approach — compose from pre-built utilities
# <div class="p-4 bg-white rounded-lg shadow">
# Each class does one thing, like calling pad(4), bg("white"), round("lg")
```

### Why Utility Classes?

- **No naming**: You never need to invent class names like `.card-wrapper-inner-header`.
- **Co-located**: Styles live right next to the markup they affect, not in a separate file.
- **Consistent**: Spacing, colours, and sizes come from a predefined scale, so the design stays consistent.
- **Responsive/interactive**: Prefixes like `md:` (medium screens), `hover:`, and `dark:` handle responsive design and interactivity inline.

## IndexedDB — "SQLite but in the Browser"

IndexedDB is a database built into every browser. Nopy uses it to store journal entries and other data locally on the user's device.

### Python Analogy

```python
# IndexedDB is conceptually like using SQLite in Python:
import sqlite3
conn = sqlite3.connect("nopy.db")
cursor = conn.cursor()
cursor.execute("INSERT INTO entries (id, content) VALUES (?, ?)", (id, content))
conn.commit()

# In the browser, IndexedDB provides similar persistent storage,
# but the API is asynchronous (uses Promises instead of blocking calls).
```

### Key Differences from SQLite

- **Asynchronous** — All operations return Promises (you `await` them), because blocking the browser's main thread would freeze the UI.
- **Key-value with indexes** — It's not SQL. You store objects by key and create indexes for querying. Think of it like a Python dictionary that persists to disk, with optional secondary indexes.
- **Per-origin** — Each website gets its own isolated database. Users can clear it from browser settings.
- **No server needed** — Data lives entirely in the browser. Good for privacy, but means data doesn't sync across devices automatically.

## Streaming APIs — "Reading a Response Line by Line"

The Anthropic SDK supports streaming, where the AI response arrives token by token instead of all at once. This is how the chat interface shows text appearing in real time.

### Python Analogy

```python
# Non-streaming — wait for the entire response
response = client.messages.create(model="claude-sonnet-4-20250514", messages=[...])
print(response.content)  # All at once

# Streaming — process chunks as they arrive (like reading a file line by line)
with client.messages.stream(model="claude-sonnet-4-20250514", messages=[...]) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)  # Prints token by token
```

In the browser, this same pattern is used with the Anthropic JavaScript SDK. As each token arrives, the store updates and the chat component re-renders to show the new text — giving the "typing" effect.

### Why Streaming Matters for UI

Without streaming, the user stares at a blank screen for several seconds. With streaming, they see the response building up immediately, which feels much more responsive even though the total time is the same.

## File Extensions Cheat Sheet

| Extension | Meaning |
|-----------|---------|
| `.ts` | TypeScript (no UI markup) |
| `.tsx` | TypeScript + JSX (React components) |
| `.js` | Plain JavaScript |
| `.jsx` | JavaScript + JSX |
| `.css` | Stylesheet |
| `.json` | Data / config (like Python dicts) |

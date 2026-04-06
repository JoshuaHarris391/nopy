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

## File Extensions Cheat Sheet

| Extension | Meaning |
|-----------|---------|
| `.ts` | TypeScript (no UI markup) |
| `.tsx` | TypeScript + JSX (React components) |
| `.js` | Plain JavaScript |
| `.jsx` | JavaScript + JSX |
| `.css` | Stylesheet |
| `.json` | Data / config (like Python dicts) |

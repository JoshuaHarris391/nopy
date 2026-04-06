# Editing Code

How to modify components, add new files, and change styles in this project.

## The Development Loop

1. Run `npm run dev` to start the dev server
2. Open `http://localhost:5173` in your browser
3. Edit a file in `src/` and save — the browser updates automatically
4. Repeat

This is your inner loop. Keep the dev server running while you work.

## Modifying a Component

Components live in `src/` and are `.tsx` files (TypeScript + JSX). Let's say you want to change the main page content:

1. Open `src/App.tsx`
2. Find the `return (...)` block — this is the JSX (HTML-like syntax) that defines what the component renders
3. Edit the JSX content
4. Save → browser updates

### Example

Change the heading in `App.tsx`:

```tsx
// Before
<h1>Vite + React</h1>

// After
<h1>Welcome to Nopy</h1>
```

Save the file. The browser shows the new heading immediately.

## Creating a New Component

In React, the UI is built from small reusable pieces called **components**. Think of them like Python functions that return UI instead of data.

### Steps

1. Create a new file, e.g. `src/MyComponent.tsx`:

```tsx
function MyComponent() {
  return (
    <div>
      <h2>Hello from MyComponent</h2>
      <p>This is a reusable piece of UI.</p>
    </div>
  )
}

export default MyComponent
```

2. Import and use it in `App.tsx`:

```tsx
import MyComponent from './MyComponent'

function App() {
  return (
    <div>
      <h1>Welcome to Nopy</h1>
      <MyComponent />
    </div>
  )
}
```

### Python Analogy

```python
# Python equivalent of the concept
def my_component():
    return "<div><h2>Hello from MyComponent</h2></div>"

def app():
    return f"<h1>Welcome to Nopy</h1>{my_component()}"
```

Components are just functions that return UI markup. The `export default` is like making a function importable from another module.

## Changing Styles

### CSS Files

- **`src/index.css`** — Global styles applied everywhere
- **`src/App.css`** — Styles scoped to the App component

Edit these files like any CSS. Changes appear instantly in the browser.

### Inline Styles (Quick and Dirty)

```tsx
<div style={{ color: 'red', fontSize: '20px' }}>
  Red text
</div>
```

Note the double curly braces — the outer `{}` is JSX expression syntax, the inner `{}` is a JavaScript object.

## Adding a New Page / Route

The starter project doesn't include routing yet. When we add it, it will typically use `react-router-dom`. For now, all content lives in `App.tsx`.

## Common Gotchas

| Gotcha | Explanation |
|--------|-------------|
| `className` not `class` | In JSX, HTML's `class` attribute is written as `className` |
| Self-closing tags | Tags like `<img>` must be written as `<img />` in JSX |
| Single root element | A component's return must have one root element. Wrap siblings in `<div>` or `<>...</>` (fragment) |
| Curly braces for JS | Use `{variable}` inside JSX to embed JavaScript expressions |
| File must export | Other files can only import what you `export` — don't forget `export default` |

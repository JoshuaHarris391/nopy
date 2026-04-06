# Project Structure

What each file and folder in the repo does, and how they connect.

## Top-Level Overview

```
nopy/
├── public/              Static assets served as-is (like a Flask static/ folder)
│   └── favicon.svg      Browser tab icon
├── src/                 All application source code lives here
│   ├── app/             AppShell layout component (the page frame)
│   ├── components/      All UI components, organised by feature
│   │   ├── ui/          Shared components (Button, Card, MoodDot, Tag, etc.)
│   │   ├── sidebar/     Sidebar navigation + BottomNav (mobile)
│   │   ├── journal/     JournalView, EntryCard, EntryEditor
│   │   ├── chat/        ChatView, ChatMessage, ChatInput, etc.
│   │   ├── profile/     ProfileView
│   │   ├── index/       IndexView (home/landing)
│   │   └── settings/    SettingsView
│   ├── hooks/           Custom React hooks (reusable logic)
│   ├── services/        API integration (Anthropic SDK, context assembly)
│   │   └── prompts/     AI system prompts
│   ├── stores/          Zustand state stores (global app state)
│   ├── types/           TypeScript interfaces and type definitions
│   ├── utils/           Helper functions
│   ├── App.tsx          Root component — sets up routing
│   ├── main.tsx         Entry point — mounts App into the HTML page
│   └── index.css        Global styles (Tailwind directives + CSS custom properties)
├── index.html           The single HTML page (React renders inside this)
├── package.json         Dependency list + scripts (like requirements.txt + Makefile)
├── package-lock.json    Pinned dependency versions (like pip freeze output)
├── vite.config.ts       Vite build tool config (includes Tailwind plugin)
├── tsconfig.json        TypeScript project references (top-level)
├── tsconfig.app.json    TypeScript config for app source code
├── tsconfig.node.json   TypeScript config for Node-side files (vite.config.ts)
├── eslint.config.js     Linter configuration (like a .flake8 or ruff.toml)
├── .nvmrc               Specifies Node.js version (like .python-version for pyenv)
├── .gitignore           Files excluded from git
├── LICENSE              Project license
└── README.md            Project overview and setup instructions
```

## How the Pieces Fit Together

### The Rendering Chain

```
index.html → main.tsx → App.tsx (router) → AppShell (layout) → Views
```

1. **`index.html`** is the shell. It has a `<div id="root">` placeholder.
2. **`main.tsx`** grabs that div and tells React to render `<App />` inside it.
3. **`App.tsx`** sets up **react-router-dom** — it maps URL paths to view components (like Flask's `@app.route` decorators).
4. **`AppShell`** (`src/app/`) wraps every page with the shared layout: sidebar, bottom nav, header, etc.
5. **View components** (JournalView, ChatView, ProfileView, etc.) are the actual page content rendered inside the shell.

**Python analogy:** Think of it like a Flask app where `main.tsx` is `app.run()`, `App.tsx` is your route definitions, `AppShell` is a Jinja base template with `{% block content %}`, and each view is a route handler that returns rendered HTML.

### The Build Pipeline

Think of this pipeline like a data transformation job:

1. **Source** → `src/` contains your TypeScript/React code (your raw data)
2. **Build tool** → Vite reads `vite.config.ts`, processes the source, compiles TypeScript, runs Tailwind, and bundles everything (your ETL job)
3. **Output** → `dist/` folder with optimised HTML, CSS, and JS (your cleaned dataset)

### How State Flows

```
Zustand Store  ←→  Components  ←→  User Interactions
     ↕
  Services (API calls, IndexedDB)
```

- **Zustand stores** (`src/stores/`) hold global state — journal entries, chat messages, user settings. Any component can read from or write to a store.
- **Services** (`src/services/`) handle external communication — calling the Anthropic API, reading/writing IndexedDB. Stores call services; services never call components directly.
- **Components** read state from stores and dispatch actions back to them.

**Python analogy:** Stores are like a shared `state = {}` dictionary that every module can import. The difference is that when you update a value, any React component using that value automatically re-renders.

### Styling with Tailwind

Styles are handled by **Tailwind CSS** utility classes applied directly in JSX, plus CSS custom properties defined in `index.css`. There is no separate `App.css` — Tailwind replaces most hand-written CSS.

```tsx
// Tailwind classes go right on the element:
<button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
  Save
</button>
```

### Config Files

| File | Purpose | Python Equivalent |
|------|---------|-------------------|
| `package.json` | Lists dependencies and scripts | `requirements.txt` + `Makefile` |
| `package-lock.json` | Locks exact dependency versions | Output of `pip freeze` |
| `tsconfig.json` | TypeScript compiler settings | `mypy.ini` or `pyproject.toml [tool.mypy]` |
| `vite.config.ts` | Build tool configuration (includes Tailwind) | `setup.py` or `pyproject.toml [tool.setuptools]` |
| `eslint.config.js` | Linter rules | `.flake8` or `ruff.toml` |
| `.nvmrc` | Node.js version | `.python-version` |

### public/ vs src/assets/

- **`public/`** — Files are served as-is, no processing. Use for things like `favicon.svg` or `robots.txt`.
- **`src/assets/`** — Files are imported in code and processed by Vite (optimised, hashed, etc.). Use for images and fonts referenced in components.

### Folder-by-Feature Organisation

Components are grouped by **feature** (journal, chat, profile) rather than by type (all buttons together, all forms together). This keeps related code close together.

**Python analogy:** It's like organising a Django project with `journal/views.py`, `journal/models.py`, `chat/views.py` rather than putting all views in one file and all models in another.

Shared components that are used across features live in `components/ui/`.

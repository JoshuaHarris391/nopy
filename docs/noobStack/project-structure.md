# Project Structure

What each file and folder in the repo does, and how they connect.

## Top-Level Overview

```
nopy/
├── public/              Static assets served as-is (like a Flask static/ folder)
│   └── favicon.svg      Browser tab icon
├── src/                 All application source code lives here
│   ├── assets/          Images, fonts, etc. that get processed by the build tool
│   ├── App.tsx          The root React component (the "main" of the UI)
│   ├── App.css          Styles scoped to App
│   ├── main.tsx         Entry point — mounts App into the HTML page
│   └── index.css        Global styles
├── index.html           The single HTML page (React renders inside this)
├── package.json         Dependency list + scripts (like requirements.txt + Makefile)
├── package-lock.json    Pinned dependency versions (like pip freeze output)
├── vite.config.ts       Vite build tool config
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

### The Build Pipeline (Python Analogy)

Think of this pipeline like a data transformation job:

1. **Source** → `src/` contains your TypeScript/React code (your raw data)
2. **Build tool** → Vite reads `vite.config.ts`, processes the source, compiles TypeScript, and bundles everything (your ETL job)
3. **Output** → `dist/` folder with optimised HTML, CSS, and JS (your cleaned dataset)

### Entry Point Chain

```
index.html  →  loads  →  src/main.tsx  →  renders  →  src/App.tsx
```

- `index.html` is the shell. It has a `<div id="root">` placeholder.
- `main.tsx` grabs that div and tells React to render `<App />` inside it.
- `App.tsx` is the root component — everything visible on screen comes from here (or components it imports).

### Config Files

| File | Purpose | Python Equivalent |
|------|---------|-------------------|
| `package.json` | Lists dependencies and scripts | `requirements.txt` + `Makefile` |
| `package-lock.json` | Locks exact dependency versions | Output of `pip freeze` |
| `tsconfig.json` | TypeScript compiler settings | `mypy.ini` or `pyproject.toml [tool.mypy]` |
| `vite.config.ts` | Build tool configuration | `setup.py` or `pyproject.toml [tool.setuptools]` |
| `eslint.config.js` | Linter rules | `.flake8` or `ruff.toml` |
| `.nvmrc` | Node.js version | `.python-version` |

### public/ vs src/assets/

- **`public/`** — Files are served as-is, no processing. Use for things like `favicon.svg` or `robots.txt`.
- **`src/assets/`** — Files are imported in code and processed by Vite (optimised, hashed, etc.). Use for images and fonts referenced in components.

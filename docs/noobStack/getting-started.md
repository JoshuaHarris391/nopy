# Getting Started

How to install dependencies, run the development server, and build the project.

## Prerequisites

| Tool | Version | Python Equivalent |
|------|---------|-------------------|
| [Node.js](https://nodejs.org/) | 20 LTS (v20.x) | Python itself |
| npm | Comes with Node | pip |
| [nvm](https://github.com/nvm-sh/nvm) (optional) | Latest | pyenv |

### Installing Node.js

**Option A — nvm (recommended):**

```bash
# Install nvm (if you don't have it)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Restart your terminal, then:
nvm install 20
nvm use 20
```

**Option B — Direct download:**

Download the Node.js 20 LTS installer from [nodejs.org](https://nodejs.org/).

### Verify Installation

```bash
node --version   # Should print v20.x.x
npm --version    # Should print 10.x.x (comes bundled with Node 20)
```

## Clone and Install

```bash
git clone <repo-url> nopy
cd nopy

# If using nvm, this reads .nvmrc and switches to Node 20:
nvm use

# Install all project dependencies (like pip install -r requirements.txt):
npm install
```

### What Just Happened?

- `npm install` read `package.json` (our `requirements.txt` equivalent) and downloaded every dependency into the `node_modules/` folder (our `venv/lib/` equivalent).
- It also created/updated `package-lock.json`, which pins exact versions (like a `pip freeze` output).

## Running the Dev Server

```bash
npm run dev
```

This starts a local development server at `http://localhost:5173`. Open that URL in your browser.

**Hot Module Replacement (HMR):** When you save a file, the browser updates instantly — no manual refresh needed. Think of it like a Jupyter notebook that re-runs the cell automatically when you change it.

Press `Ctrl+C` to stop the server.

## Building for Production

```bash
npm run build
```

This compiles TypeScript, bundles everything, and outputs optimised static files to the `dist/` folder. You could then serve `dist/` with any static file server.

## Previewing the Build

```bash
npm run preview
```

Serves the `dist/` folder locally so you can check the production build before deploying.

## Linting

```bash
npm run lint
```

Runs ESLint to check code style and catch common errors. Similar to running `flake8` or `ruff` in Python.

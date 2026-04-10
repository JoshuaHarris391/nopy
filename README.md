# nopy

Nopy is an open source, locally deployed, AI-assisted journal. Your data never leaves your machine — entries are stored as plain Markdown files on your filesystem, and AI features use your own Anthropic API key.

## Tech Stack

- **React 19** + **TypeScript** — UI framework
- **Vite** — Build tool and dev server
- **Tailwind CSS** — Utility-first styling
- **Tauri** — Lightweight desktop shell (Rust) for native file system access
- **Zustand** — State management with IndexedDB + filesystem persistence
- **Anthropic SDK** — AI chat (Claude Opus 4.6) and entry indexing (Claude Haiku 4.5)

## Features

- **Structured journaling** — Simple markdown editor with manual save
- **AI psychologist chat** — CBT/ACT-grounded conversational agent with streaming responses and session continuity
- **Psychological profile** — Auto-generated insights from your journal entries
- **Entry indexing** — Mood tracking, theme extraction, and searchable index
- **Local-first storage** — Entries saved as `.md` files to a directory you choose; profile and index as JSON
- **Privacy by design** — No cloud, no telemetry, no accounts

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 20 LTS (v20.x) | [nodejs.org](https://nodejs.org/) or via [nvm](https://github.com/nvm-sh/nvm) |
| **npm** | 10.x (bundled with Node 20) | Comes with Node.js |
| **Rust** | Latest stable | [rustup.rs](https://rustup.rs/) (required for Tauri desktop app) |

### Recommended: Use nvm

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Install and use the correct Node version (reads .nvmrc)
nvm install
nvm use
```

## Getting Started

```bash
# Clone the repo
git clone <repo-url> nopy
cd nopy

# Switch to the correct Node version (if using nvm)
nvm use

# Install dependencies
npm install
```

### Run in browser (no file system access)

```bash
npm run dev
```

Open `http://localhost:5173`. Entries are stored in browser IndexedDB only.

### Run as desktop app (recommended)

```bash
npm run tauri dev
```

Opens a native window with full file system access. Set your journal location in **Settings > Data & Privacy** to save entries as Markdown files on disk.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the browser dev server with hot reload |
| `npm run build` | Type-check and build for production (output in `dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint to check code style |
| `npm run tauri dev` | Run the desktop app with hot reload |
| `npm run tauri build` | Build the desktop app for distribution |

## Testing

The test suite uses [Vitest](https://vitest.dev/) and covers the core pure-logic layer — schemas, utility functions, and service helpers. Tests are focused on behaviour (inputs → expected outputs) rather than coverage metrics.

### Running tests

```bash
# Run all tests once
npm test

# Run in watch mode (re-runs on file change)
npm run test:watch
```

### Test structure

Tests live in `src/__tests__/`, mirroring the source tree:

| File | What it covers |
|------|---------------|
| `schemas/journal.test.ts` | Zod validation + AI output coercion for mood, tags, summary |
| `schemas/profile.test.ts` | Profile schema validation and framework catch defaults |
| `schemas/frontmatter.test.ts` | Frontmatter parsing with optional field defaults |
| `utils/tokenEstimator.test.ts` | Token estimation formula |
| `services/entryProcessor.test.ts` | `computeLocalStats` — mood averaging, streak, reflection depth |
| `services/contextAssembler.test.ts` | Context assembly — token budgeting, message truncation, profile injection |
| `services/fs.test.ts` | `slugify`, `entryToMarkdown`, `parseMarkdown`, `extractDateFromFilename` |

API-dependent functions (`processEntry`, `generateProfileFromEntries`, etc.) and React components are intentionally excluded from the test suite during the rapid-development phase — they are better validated through manual testing and integration review.

## Configuration

On first launch, go to **Settings** and configure:

1. **Anthropic API Key** — required for AI chat and entry indexing. Your key stays local.
2. **Journal location** — choose where to save your entries as Markdown files (desktop app only).

## Documentation

See the [`docs/`](docs/README.md) folder for detailed project documentation, including the **[noobStack](docs/noobStack/README.md)** guides — a set of docs aimed at contributors who are new to this tech stack (e.g. data engineers coming from Python).

## License

See [LICENSE](LICENSE) for details.

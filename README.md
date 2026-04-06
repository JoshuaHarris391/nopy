# nopy

Nopy is an open source, locally deployed, AI-assisted journal.

## Tech Stack

- **React 19** — UI framework
- **TypeScript** — Type-safe JavaScript
- **Vite** — Build tool and dev server

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 20 LTS (v20.x) | [nodejs.org](https://nodejs.org/) or via [nvm](https://github.com/nvm-sh/nvm) |
| **npm** | 10.x (bundled with Node 20) | Comes with Node.js |

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

# Start the development server
npm run dev
```

The dev server runs at `http://localhost:5173`. Changes to source files are reflected in the browser instantly.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the local dev server with hot reload |
| `npm run build` | Type-check and build for production (output in `dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint to check code style |

## Documentation

See the [`docs/`](docs/README.md) folder for detailed project documentation, including the **[noobStack](docs/noobStack/README.md)** guides — a set of docs aimed at contributors who are new to this tech stack (e.g. data engineers coming from Python).

## License

See [LICENSE](LICENSE) for details.

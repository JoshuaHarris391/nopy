# Data Storage

How Nopy stores your data locally, and where it actually lives on disk.

## The Short Version

Everything stays in your browser. Nothing is sent to a remote server (except your messages to Anthropic's API when you chat). There are two storage mechanisms:

| What | Where | Library | Browser API |
|------|-------|---------|-------------|
| Settings (API key, preferred model, sidebar state) | `localStorage` | Zustand `persist` middleware | Web Storage API |
| Journal entries | IndexedDB | `idb-keyval` | IndexedDB API |
| Chat sessions & messages | IndexedDB | `idb-keyval` | IndexedDB API |
| Psychological profile | IndexedDB | `idb-keyval` | IndexedDB API |
| Temporary UI state (loading spinners, etc.) | Memory only | Zustand (no persistence) | — |

## localStorage — Settings

The settings store (`src/stores/settingsStore.ts`) uses Zustand's built-in `persist` middleware, which serialises the entire store to `localStorage` under a single key:

```
localStorage key: "nopy-settings"
```

This stores:
- **`apiKey`** — your Anthropic API key (stored as plaintext)
- **`preferredModel`** — e.g. `claude-opus-4-6`
- **`onboardingComplete`** — whether you've finished onboarding
- **`sidebarCollapsed`** — sidebar toggle state

### Python Analogy

```python
import json

# Writing
settings = {"apiKey": "sk-ant-...", "preferredModel": "claude-opus-4-6"}
with open("nopy-settings.json", "w") as f:
    json.dump(settings, f)

# Reading
with open("nopy-settings.json") as f:
    settings = json.load(f)
```

`localStorage` is synchronous and limited to roughly 5–10 MB — fine for small config values.

## IndexedDB — Journal, Chat, Profile

The heavier data stores (`src/stores/journalStore.ts`, `src/stores/chatStore.ts`, `src/stores/profileStore.ts`) use `idb-keyval`, a tiny wrapper around the browser's IndexedDB API. Each store reads and writes under its own key:

| Store | IndexedDB Key(s) | What's Stored |
|-------|-------------------|---------------|
| Journal | `nopy-entries` | Array of all journal entries |
| Chat | `chat:meta` | Array of session metadata (titles, timestamps, previews) |
| Chat | `chat:session:<uuid>` | Full session object (all messages) — one key per session |
| Profile | `nopy-profile` | Psychological profile object |

### Python Analogy

```python
import shelve

# idb-keyval is like Python's shelve — a persistent key-value store
db = shelve.open("nopy")
db["nopy-entries"] = [{"id": "abc", "title": "My first entry", ...}]
db["chat:session:abc-123"] = {"id": "abc-123", "messages": [...]}
entries = db["nopy-entries"]
```

IndexedDB is asynchronous (all operations return Promises) and can store much more data than `localStorage` — suitable for a growing collection of entries and chat histories.

## In-Memory Only — UI State

The UI store (`src/stores/uiStore.ts`) is a plain Zustand store with **no persistence**. It holds transient state like loading spinners. This data is lost on page refresh — which is the intended behaviour.

## What Survives What

| Event | Settings | Journal / Chat / Profile | UI State |
|-------|----------|--------------------------|----------|
| Page refresh | ✅ | ✅ | ❌ |
| Close browser tab | ✅ | ✅ | ❌ |
| Restart computer | ✅ | ✅ | ❌ |
| "Clear browsing data" | ❌ | ❌ | ❌ |
| Incognito / private mode | Lost on window close | Lost on window close | ❌ |
| Different browser | Not shared | Not shared | — |
| Different device | Not shared | Not shared | — |

## Where It Lives on Disk

The browser stores this data in its own profile directory. On macOS:

- **Chrome**: `~/Library/Application Support/Google/Chrome/Default/Local Storage/` (localStorage) and `~/Library/Application Support/Google/Chrome/Default/IndexedDB/` (IndexedDB)
- **Firefox**: `~/Library/Application Support/Firefox/Profiles/<profile>/storage/default/`
- **Safari**: `~/Library/Safari/` and `~/Library/WebKit/`

You don't need to touch these files directly. Use the browser's DevTools to inspect storage:
- **localStorage**: DevTools → Application → Local Storage → your origin → `nopy-settings`
- **IndexedDB**: DevTools → Application → Storage → IndexedDB → look for `keyval-store`

## Security Note

Your API key is stored as **plaintext** in `localStorage`. It is never sent anywhere except directly to Anthropic's API. However, anyone with access to your browser or machine could read it from DevTools or the filesystem. This is standard for client-side-only apps — there is no server to store secrets on your behalf.

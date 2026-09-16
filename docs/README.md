# nopy documentation

The top-level [README](../README.md) tells you what nopy is and how to run it. This folder holds everything heavier, one hop away.

## Start here

| If you want to… | Read |
|---|---|
| Understand how entries, the index, profiles and chat move between memory, IndexedDB and disk | [`architecture/data-pipeline.md`](architecture/data-pipeline.md) |
| Understand what the AI is asked, when, and what it is never shown | [`architecture/llm-pipeline.md`](architecture/llm-pipeline.md) |
| Touch the markdown files or the Tauri filesystem calls | [`architecture/filesystem-layer.md`](architecture/filesystem-layer.md) |
| Add or change a Zustand store | [`architecture/state-management.md`](architecture/state-management.md) |
| Build UI with the existing primitives and hooks | [`architecture/components.md`](architecture/components.md) |
| Run a local model instead of a hosted provider | [`architecture/local-llm-integration.md`](architecture/local-llm-integration.md) |
| Understand the visual language | [`design/DESIGN.MD`](design/DESIGN.MD) |

## Feature specs

[`features/`](features/) holds proposals and specs for larger features (currently the Context Workspace). A spec describes intent; the architecture docs describe what shipped.

## Task notes

[`tasks/`](tasks/) is a working folder of implementation notes and refactor plans. They are dated by nature: each carries a status line at the top, and a note marked resolved or superseded is kept for the reasoning, not as a description of current behaviour. When in doubt, the architecture docs win.

## Keeping these true

When a change alters how something is run, stored, or sent to a provider, update the relevant architecture doc in the same commit. A wrong doc costs more than a missing one.

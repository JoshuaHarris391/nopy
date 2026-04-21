# LLM Pipeline

How nopy uses Claude to index journal entries, extract themes, and generate psychological profiles.

**Contents**

- [Overview](#overview) — the three AI operations
- [Entry metadata extraction](#entry-metadata-extraction) — indexing individual entries via Haiku
- [Theme extraction](#theme-extraction) — identifying cross-entry patterns
- [Profile generation](#profile-generation) — the five-phase pipeline
- [Chat context assembly](#chat-context-assembly) — building the system prompt for conversations
- [Therapy agent selection](#therapy-agent-selection) — swapping the chat agent's therapeutic frame (CBT, ACT, …)
- [Shared utilities](#shared-utilities) — `parseLLMJson`, model IDs, prompt templates
- [File reference](#file-reference)

---

## Overview

Nopy makes three categories of AI calls:

| Operation | Model | Trigger | Output |
|---|---|---|---|
| Entry metadata extraction | Haiku | "Update Index" button | mood, tags, summary per entry |
| Theme extraction | Haiku | Profile generation (step 3) | themes, cognitive patterns, strengths, growth areas |
| Full profile generation | Opus 4.6 | Profile generation (step 4) | 2000-4000 word clinical markdown document |

All calls go through `src/services/anthropic.ts`, which wraps the Anthropic SDK.

---

## Entry metadata extraction

When the user clicks "Update Index", unprocessed entries are sent to Haiku one at a time via `processAllEntries()` in `src/services/entryProcessor.ts`.

```
processAllEntries(entries, apiKey, force, onProgress, signal)
  ├─ filter to !indexed (unless force=true)
  └─ for each entry sequentially:
       processEntry(entry, apiKey, signal)
         ├─ Anthropic API (Haiku, max 500 tokens)
         ├─ parseLLMJson(response, EntryMetadataCoercedSchema)
         └─ returns { mood, tags, summary }
       journalStore.updateEntry(id, { ...metadata, indexed: true })
```

Entries are processed **sequentially** for rate-limit safety. A thrown error on one entry is logged and the loop continues.

### The coercion schema

`EntryMetadataCoercedSchema` (`src/schemas/journal.ts`) is deliberately forgiving with AI output:

| Field | Drift | Repair |
|---|---|---|
| `mood.value` | Out of range or non-numeric string | Coerce to number, clamp to 1-10, fall back to 5 |
| `mood.label` | Unknown label | Fall back to "neutral" |
| `tags` | Bare string instead of array | Wrap in `[string]`, enforce 1-10 items |
| `summary` | Missing or empty | Throws — no safe fallback |

This schema is one of the best-designed parts of the codebase. Don't simplify it — the `.catch()` fallbacks are load-bearing.

---

## Theme extraction

`generateProfileFromEntries()` (`entryProcessor.ts`) sends entry summaries to Haiku and returns structured themes, cognitive patterns, strengths, growth areas, and emotional trends. The response is validated with `ProfileResponseSchema` (`src/schemas/profile.ts`).

---

## Profile generation

The full pipeline is orchestrated by `profileStore.generateProfile()` (`src/stores/profileStore.ts`):

1. **Index unprocessed entries** — delegates to `processAllEntries` (Haiku).
2. **Local stats** — `computeLocalStats()` calculates average mood, journaling streak, average entry length, reflection depth. No API call. This function is pure and covered by the existing test suite.
3. **Narrative profile** — `generateProfileFromEntries()` (Haiku). Returns structured data validated by `ProfileResponseSchema`.
4. **Full profile** — `generateFullProfile()` (Opus 4.6). Returns a long-form clinical markdown document. Not schema-validated — the output is free-form text.
5. **Persist** — merges all results into `PsychologicalProfile`, writes to IndexedDB and disk.

Each phase updates `phase` and `progress` in the store for the UI progress bar. The pipeline respects an `AbortSignal` for cancellation.

---

## Chat context assembly

`assembleContext()` (`src/services/contextAssembler.ts`) builds the system prompt and message history for chat sessions. It is a **pure function** with clean ordering:

1. **Base system prompt** — the active therapy agent's system prompt (see [Therapy agent selection](#therapy-agent-selection)) plus today's date.
2. **Psychological profile** — the full profile markdown (or summary fallback) if available.
3. **Themes** — structured theme data from the profile.
4. **Journal index** — a markdown table of indexed entries (title, date, mood, tags, summary), capped at 30 entries.
5. **Focused entry context** — if the user navigated to chat from a specific entry, that entry's full content is injected.
6. **Session summary** — if the session has a rolling summary and the message count is high, the summary is prepended as synthetic user/assistant messages.
7. **Message history** — the session's messages, truncated from the oldest when the token budget is exceeded.

The function has explicit **token budgeting** — it estimates token usage and drops the oldest messages first when the history exceeds the budget. The token estimator is at `src/utils/tokenEstimator.ts`.

This function is well-tested (14 tests in `src/__tests__/services/contextAssembler.test.ts`). Don't split it up — it is a single logical operation. If it feels verbose, it's because context assembly is inherently detailed.

---

## Therapy agent selection

The live chat agent's therapeutic frame is user-selectable. The registry at `src/services/prompts/therapists/` maps a `TherapyType` key to a full `TherapyAgent` definition (label, description, `systemPrompt`). `ChatView.tsx` reads the current `therapyType` from the settings store, calls `getTherapyPrompt(therapyType)`, and passes the result as the base system prompt to `assembleContext()`.

```
src/services/prompts/therapists/
├─ index.ts   → TherapyType union, TherapyAgent interface, THERAPIES record,
│               DEFAULT_THERAPY, getTherapyPrompt(type), listTherapies()
├─ cbt.ts     → CBT_SYSTEM_PROMPT  (structured CBT session, cognitive restructuring)
└─ act.ts     → ACT_SYSTEM_PROMPT  (psychological flexibility, defusion, values, workability)
```

The selection is persisted on the `therapyType` field of the Zustand settings store (`src/stores/settingsStore.ts`, localStorage key `nopy-settings`). When the field is absent — for example on first install or for users who upgraded before the feature shipped — `getTherapyPrompt(undefined)` falls back to `DEFAULT_THERAPY` (`'cbt'`), so existing behaviour is preserved.

The UI control lives in `src/components/settings/sections/TherapySection.tsx` and renders a `<select>` populated from `listTherapies()`. Only the live chat agent prompt swaps; the profile generator (`fullProfile.ts`) remains framework-neutral and does not change when the therapy type is switched.

### Adding a new therapy type

1. Create `src/services/prompts/therapists/<name>.ts` exporting a `<NAME>_SYSTEM_PROMPT` constant (template literal with the full system prompt).
2. In `src/services/prompts/therapists/index.ts`:
   - Import the new constant.
   - Widen the `TherapyType` union with the new key (e.g. `'dbt'`).
   - Add an entry to the `THERAPIES` record with `id`, `label`, `shortLabel`, `description`, and `systemPrompt`.
3. Add a corresponding test case to `src/__tests__/services/therapyRegistry.test.ts` (content smoke test for the new prompt + membership assertion).
4. No other files need to change — `ChatView`, the settings store, the UI dropdown, and the settings type (`TherapyType`) pick up the new entry automatically.

---

## Shared utilities

### `parseLLMJson<T>(raw, schema)`

**File**: `src/services/parseLLMJson.ts`

A single function that handles the full parse pipeline for structured LLM responses:

1. Strips markdown ```` ```json ``` ```` fences and trailing prose.
2. `JSON.parse`s the cleaned string.
3. Pipes through `schema.safeParse()`.
4. Returns typed data on success; throws `LLMParseError` on failure.

Every call site that extracts structured data from Claude uses this function. Don't bypass it with inline `JSON.parse` — the fence-stripping is always needed.

### Model IDs and token limits

**File**: `src/services/models.ts`

```typescript
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
export const OPUS_MODEL = 'claude-opus-4-6'
export const TOKEN_LIMITS = { entryMetadata: 500, themeExtraction: 4000, ... }
```

This is the single place to see what models the app talks to and what token budgets each operation uses.

### Prompt templates

**Directory**: `src/services/prompts/`

Each AI operation has its prompt template in a dedicated file:

| File | Operation |
|---|---|
| `entryMetadata.ts` | Entry metadata extraction system prompt |
| `profileNarrative.ts` | Theme extraction system prompt |
| `fullProfile.ts` | Full profile generation system prompt |
| `therapists/index.ts` | Chat agent registry (see [Therapy agent selection](#therapy-agent-selection)) |
| `therapists/cbt.ts` | CBT chat agent system prompt |
| `therapists/act.ts` | ACT chat agent system prompt |

Each file exports a named constant (e.g. `FULL_PROFILE_SYSTEM`, `CBT_SYSTEM_PROMPT`).

---

## File reference

| Concern | File |
|---|---|
| Anthropic SDK wrapper | `src/services/anthropic.ts` |
| Entry and profile processing | `src/services/entryProcessor.ts` |
| Context assembly | `src/services/contextAssembler.ts` |
| LLM JSON parser | `src/services/parseLLMJson.ts` |
| Model IDs and token limits | `src/services/models.ts` |
| Prompt templates | `src/services/prompts/*.ts` |
| Therapy agent registry | `src/services/prompts/therapists/index.ts` |
| Therapy settings UI | `src/components/settings/sections/TherapySection.tsx` |
| Token estimator | `src/utils/tokenEstimator.ts` |
| AI response schemas | `src/schemas/journal.ts`, `src/schemas/profile.ts` |
| Profile generation orchestration | `src/stores/profileStore.ts` |
| Entry processing test suite | `src/__tests__/services/entryProcessor.test.ts` |
| Context assembly test suite | `src/__tests__/services/contextAssembler.test.ts` |

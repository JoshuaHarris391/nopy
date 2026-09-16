# LLM Pipeline

How nopy uses Claude, OpenAI, or a local LM Studio model to index journal entries and generate psychological profiles, and how the Insights page and the chat's context are built from those results without further calls.

**Contents**

- [Overview](#overview) — where the model is called, and where it is not
- [Provider routing](#provider-routing) — Anthropic vs. OpenAI vs. local LM Studio
- [Entry indexing](#entry-indexing) — one structured record per entry, the only place raw text is read
- [Profile generation](#profile-generation) — corpus report, record tiers, incremental revisions, versions
- [Insights](#insights) — local time-series over the index, no model involved
- [Chat context assembly](#chat-context-assembly) — building the system prompt for conversations
- [Therapy agent selection](#therapy-agent-selection) — swapping the chat agent's therapeutic frame (CBT, ACT, …)
- [Shared utilities](#shared-utilities) — `parseLLMJson`, token limits, prompt templates
- [File reference](#file-reference)

---

## Overview

The guiding split is **instrument versus analyst**:

- The **indexer** is an instrument. It reads one entry's raw text, once, and writes a fixed-schema record into that entry's frontmatter. It measures what is on the page; it does not diagnose.
- The **profile generator** is the analyst. It reads only index records and a deterministic report computed from them. Raw journal text never reaches it, which is what keeps generation affordable as a journal grows.

| Operation | Model slot | Trigger | Reads | Writes |
|---|---|---|---|---|
| Entry indexing | lightweight | "Update Index", per-entry Re-index, Settings "Re-index un-indexed", or profile generation (for entries in scope that were never indexed) | one entry's raw text + hints | mood, domains, summary and the `insight` record in the entry's frontmatter |
| Summary profile | lightweight | profile generation | corpus report + brief records | themes, patterns, strengths, growth areas, trends (JSON) |
| Full profile | main | profile generation | corpus report + standard/digest records (+ the selected prior profile in incremental mode) | a 2000–3500 word clinical markdown document |
| Chat | main | each message | assembled context (below) | streamed reply |

The Insights page makes no calls at all. Everything on it is computed from the stored records.

All calls flow through the dispatcher at `src/services/llm.ts`, which routes to `src/services/anthropic.ts`, `src/services/openai.ts` or `src/services/localServer.ts` based on `settings.provider`.

## Provider routing

The dispatcher takes an `LlmConfig` slice from `settingsStore` and resolves a **role** (`main` or `lightweight`) to a configured model id per provider (`resolveModel`). Two rules:

- **All-or-nothing scope.** With `provider === 'local'`, *every* AI call goes to LM Studio. There is no mixed mode where indexing stays on a hosted provider, which would silently send journal data elsewhere.
- **Blank lightweight slots fall back to the main slot** for OpenAI and local providers, so a single-model setup works with no extra configuration.

For the user-facing walk-through of local mode see [`local-llm-integration.md`](./local-llm-integration.md).

---

## Entry indexing

Indexing is the only place an entry's body is handed to a model. `processEntry()` in `src/services/entryProcessor.ts` runs one entry; `processAllEntries()` runs a batch, oldest first, sequentially.

```
processAllEntries(entries, config, mode, onProgress, signal)
  ├─ mode selects the batch: 'unindexed' | 'stale' | 'needed' (both) | 'all'
  └─ for each entry, oldest first:
       hints = buildIndexHints(entries so far, entry)     ← roster, recurring phrases, stated mood
       processEntry(entry, config, signal, hints)
         ├─ sendMessage(lightweight, ENTRY_METADATA_SYSTEM, [hints + entry text], 2500 tokens)
         ├─ parseLLMJson(response, EntryRecordCoercedSchema)   ← tolerant shape
         ├─ finaliseRecord(...)                                ← local guards (below)
         ├─ findRecordProblems(...)  → repair loop, up to 3 retries
         └─ returns { mood, domains, summary, insight, indexModel }
     journalStore.applyProcessedMetadata(results)             ← memory → IndexedDB → disk
```

### The record

Each indexed entry stores, in its frontmatter (`src/schemas/journal.ts`, `EntryInsightSchema`):

| Field | What it holds |
|---|---|
| `mood` + `moodSource` | The writer's own rating (`writer`) is never overwritten; otherwise the indexer's estimate (`indexer`). The estimate is also kept as `insight.inferredMood`. |
| `tags` | Closed **domains** vocabulary (work, family, health, …). |
| `summary` | 2–4 sentences: what happened, the emotional core, what helped or hindered. |
| `insight.states` | Seven inferred 0–10 states (anxiety, irritability, sadness, calm, agency, connection, meaning), each with an anchored confidence and a short evidence string. Confidence below 0.3 means the value is null. |
| `insight.emotions` | Up to four labels from a closed list, with intensity. |
| `insight.people` | Who appears, their role, the interaction kind and how the writer felt afterwards (closed lists). |
| `insight.quotes` | Up to four verbatim excerpts with a category, and a link to a recurring phrase when one matches. |
| `insight.focalEvent` | Trigger → interpretation → emotion/body → behaviour → outcome (→ the writer's own alternative view). |
| `insight.revelations`, `insight.prediction` | Explicit realisations or decisions in the writer's voice; an explicit expectation with a target date. |
| `insight.coping`, `insight.body`, `insight.safety` | Coping strategies with reported effect; sleep, substances, symptoms; a `none | monitor | concern` flag with evidence. |
| `insight.observations` | Up to three hedged hypotheses, each tagged `stated` or `inferred`. The only interpretive field. |
| `insight.unclassified` | Raw terms that fit no vocabulary, kept for review rather than invented into a category. |
| `indexVersion`, `indexModel` | Which schema/prompt version and which model produced the record. |

The system prompt (`buildEntryIndexSystemPrompt()` in `src/services/prompts/entryMetadata.ts`) interpolates every vocabulary from the zod enums, so the prompt cannot drift from what the parser accepts. It is byte-identical for every entry; per-entry material goes in the user message.

### Hints

The user message carries, before the entry text: the writer's stated mood (so the model never argues with it), a **known-people roster** (names and roles aggregated from already-indexed entries, spelling reference only), and the **recurring phrases** seen recently, so the model can mark a quote that repeats one with minor drift.

### Local guards

Nothing the model returns is stored unchecked. After parsing, `finaliseRecord()` (`src/services/entryRecords.ts`) applies, in order:

1. **Vocabulary routing** — near-misses land on the canonical term ("Doom scrolling" → `doomscrolling`); unknown terms go to `other` where the list has one, otherwise are dropped, and are recorded in `unclassified`.
2. **Verbatim quotes** — a quote is kept only if it appears in the entry (whitespace and curly quotes folded) and has at least four words.
3. **Recurring-phrase links** — `matchesRecent` must name a phrase that was actually in the hints.
4. **Roster leakage** — a person is dropped unless their name or role phrase appears in the entry.
5. **Confidence floor** — state values below 0.3 confidence are nulled.

### Repair loop

If the response is not JSON, fails the tolerant schema, or is degenerate (no summary, no domains, or mostly off-vocabulary), the model is asked to fix it: the conversation is extended with its own output and the specific problems, up to `MAX_INDEX_RETRIES` (3) times. A still-unusable entry is logged and stays unindexed for that run.

### Versions and re-indexing

`CURRENT_INDEX_VERSION` bumps whenever the schema or the prompt changes. An entry is **stale** when it is indexed under an older version or its stored record could not be read back. Stale entries are never re-read automatically; Settings → "Re-index un-indexed entries (N)" lists and reprocesses them (together with never-indexed entries), the Index page marks them `legacy`, and the Insights page explains which charts they are missing from.

---

## Profile generation

Orchestrated by `profileStore.generateProfile()` (`src/stores/profileStore.ts`). Before anything runs, the entry list is narrowed by the Profile page's **scope** setting (all entries, newest N, or last N months), and every step below sees that same list.

1. **Index** entries in scope that were never indexed (see above).
2. **Local stats** — `computeLocalStats()`: average mood, journaling streak, entry length, reflection depth. No call.
3. **Corpus report** — `buildCorpusReport()` (`src/services/entryRecords.ts`) computes deterministic rollups from the records, never re-estimated: per month, the writer's mood mean/min/max, the indexer's mood, each state's mean over confident values, top emotions, domains, people with how the writer felt afterwards, coping with mean effect, sleep and substances, safety flags; plus a people roster with first/last-seen dates, recurring verbatim phrases with counts, the predictions made, and every safety flag with its date. Rendered as compact markdown. No call.
4. **Summary profile** — `generateProfileFromEntries()` (lightweight): the corpus report plus **brief** records (summary, realisations, safety) for the recent window and one-line **digests** for older entries, fitted to the lightweight model's context window. Output validated by `ProfileResponseSchema`.
5. **Full profile** — `generateFullProfile()` (main): the corpus report plus **standard** records (summary, people, quotes, focal chain, realisations, prediction, safety, observations) for the recent window (last 90 days or newest 60 entries) and digests for the rest, fitted to the main model's window; oldest records are omitted first and the prompt says how many. In **incremental** mode (the default setting) the selected prior profile is sent too and the model revises it with only the records it has not seen; a scope change forces a full write. The evidence rules in `src/services/prompts/fullProfile.ts` tell the analyst how to weigh each field: the writer's mood is primary, quotes are the only verbatim material, observations are leads to confirm by convergence, safety flags are never averaged away.
6. **Persist** — the result becomes a new **version** (`id`, `createdAt`, `scope`, `basedOn`, `isRevision`). Every version is kept; the newest is selected automatically, and the selected version is what Context and Chat inject. See [`data-pipeline.md`](./data-pipeline.md#profile-generation) for storage.

Each phase updates `phase` and `progress` for the UI, and the pipeline respects an `AbortSignal`. A failed full-profile step keeps the prior full profile rather than dropping it.

---

## Insights

`src/services/insightSeries.ts` turns the stored records into time series for the Insights page: mood points (writer-rated vs inferred) with bucket means, state means at confidence ≥ 0.5, emotion and domain counts with a top-N-plus-other rule, sleep and body events, a window summary and the safety rows. Buckets come from `src/utils/timeSeries.ts` (week → days, month → weeks, year and all-time → months). No model is involved; the page works offline and in private mode is hidden along with the other AI-derived surfaces.

---

## Chat context assembly

`assembleContext()` (`src/services/contextAssembler.ts`) builds the system prompt and message history for chat sessions. It is a **pure function** with clean ordering:

1. **Base system prompt** — the active therapy agent's system prompt (see [Therapy agent selection](#therapy-agent-selection)) plus today's date.
2. **Psychological profile** — the selected version's full profile markdown (or its summary as a fallback), then its recurring themes.
3. **Journal index** — a markdown table of indexed entries (title, date, mood, tags, summary), capped by the `journalIndexLimit` setting. The structured `insight` record is not injected into chat.
4. **Focused entry context** — if the user navigated to chat from a specific entry, that entry's full content is injected.
5. **Session summary** — if the session has a rolling summary and the message count is high, the summary is prepended as synthetic user/assistant messages.
6. **Message history** — the session's messages, truncated from the oldest when the token budget is exceeded.

The function has explicit **token budgeting** — it estimates token usage and drops the oldest messages first when the history exceeds the budget. The token estimator is at `src/utils/tokenEstimator.ts`.

This function is well-tested (`src/__tests__/services/contextAssembler.test.ts`). Don't split it up — it is a single logical operation.

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

The selection is persisted on the `therapyType` field of the settings store. When the field is absent, `getTherapyPrompt(undefined)` falls back to `DEFAULT_THERAPY` (`'cbt'`).

The UI control lives in `src/components/settings/sections/TherapySection.tsx`. Only the live chat agent prompt swaps; the profile generator remains framework-neutral.

### Adding a new therapy type

1. Create `src/services/prompts/therapists/<name>.ts` exporting a `<NAME>_SYSTEM_PROMPT` constant.
2. In `src/services/prompts/therapists/index.ts`: import it, widen the `TherapyType` union, add a `THERAPIES` entry with `id`, `label`, `shortLabel`, `description`, and `systemPrompt`.
3. Add a test case to `src/__tests__/services/therapyRegistry.test.ts`.
4. Nothing else changes — the settings UI and store pick up the new entry automatically.

---

## Shared utilities

### `parseLLMJson<T>(raw, schema)`

**File**: `src/services/parseLLMJson.ts`

Strips markdown fences and trailing prose, `JSON.parse`s, pipes through `schema.safeParse()`, and throws `LLMParseError` (carrying the raw text and the zod issues) on failure. Every structured call site uses it; the indexer's repair loop reads the issues off the error to tell the model what to fix.

### Token limits and context windows

**File**: `src/services/models.ts`

`TOKEN_LIMITS` holds the output caps per operation (`entryMetadata: 2500`, `profileNarrative: 4000`, `fullProfile: 10000`, `titleGeneration: 50`). `getModelContextWindow()` resolves the active model's context window (manual override → LM Studio's reported window → catalog → static map → provider default); the profile steps use it to decide how many records fit.

### Prompt templates

**Directory**: `src/services/prompts/`

| File | Operation |
|---|---|
| `entryMetadata.ts` | `buildEntryIndexSystemPrompt()` and `buildEntryIndexUserMessage()` for indexing |
| `profileNarrative.ts` | Summary profile system prompt |
| `fullProfile.ts` | `FULL_PROFILE_SYSTEM` (first write) and `FULL_PROFILE_REVISE_SYSTEM` (incremental revision), sharing one set of evidence rules |
| `voice.ts` | Tone preamble shared by the human-facing prompts (not the indexer) |
| `therapists/*` | Chat agent registry and prompts |

---

## File reference

| Concern | File |
|---|---|
| Provider dispatcher and role resolution | `src/services/llm.ts` |
| Provider wrappers | `src/services/anthropic.ts`, `src/services/openai.ts`, `src/services/localServer.ts` |
| Indexing, repair loop, both profile generators, local stats | `src/services/entryProcessor.ts` |
| Record guards, roster, recurring phrases, corpus report, record rendering and budget fitting, scope | `src/services/entryRecords.ts` |
| Insights time series | `src/services/insightSeries.ts`, `src/utils/timeSeries.ts` |
| Context assembly | `src/services/contextAssembler.ts` |
| LLM JSON parser | `src/services/parseLLMJson.ts` |
| Token limits and context windows | `src/services/models.ts` |
| Prompt templates | `src/services/prompts/*.ts` |
| Index and profile schemas | `src/schemas/journal.ts`, `src/schemas/profile.ts` |
| Profile generation orchestration and version history | `src/stores/profileStore.ts` |
| Tests | `src/__tests__/services/{entryProcessor,entryRecords,structuredIndex,insightSeries,contextAssembler}.test.ts`, `src/__tests__/stores/profileHistory.test.ts` |

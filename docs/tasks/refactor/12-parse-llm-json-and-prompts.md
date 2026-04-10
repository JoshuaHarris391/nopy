# 12 — Consolidate LLM JSON Parsing, Prompts, and Model IDs

## Problem

Three concerns are scattered and duplicated across the services and components layers:

1. **LLM JSON parsing.** `entryProcessor.ts:39` and `:116` both strip markdown code fences from Claude responses, `JSON.parse` the result, and pipe through a Zod schema. The fence-stripping logic is identical; each call site reimplements it.

2. **Prompt templates.** `entryProcessor.ts` contains three large inline prompt strings at L21-30 (entry metadata), L95-108 (theme extraction), and L151-200 (full profile generation). Meanwhile, `src/services/prompts/` already exists and is used by `ChatView.tsx:9` — the entry-processing prompts just never moved there.

3. **Model IDs and token limits.** The string `'claude-haiku-4-5-20251001'` appears in `entryProcessor.ts` and `ChatView.tsx:174`. `'claude-opus-4-6'` appears in `entryProcessor.ts:141`. `max_tokens` values (500, 4000, 8000) are scattered literals. Changing the default model for indexing requires a multi-file search.

## Current Behaviour

### Duplicate fence-stripping — `entryProcessor.ts:39`

```typescript
const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
const parsed = JSON.parse(cleaned)
const validated = EntryMetadataCoercedSchema.parse(parsed)
```

The same three lines appear again at `entryProcessor.ts:116` for theme extraction, with a different schema.

### Inline prompts — `entryProcessor.ts:21-30`

```typescript
const response = await sendMessage(
  apiKey,
  HAIKU_MODEL,
  `You are a journaling assistant. Analyse the following journal entry...`,
  [{ role: 'user', content: `Title: ${entry.title}\n\n${entry.content}` }],
  500,
  signal,
)
```

Three prompts are inlined this way across the file.

### Scattered model IDs

```typescript
// entryProcessor.ts
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

// ChatView.tsx:174
model: selectedModel || 'claude-haiku-4-5-20251001'
```

No single place to see what models the app talks to.

## Desired Behaviour

- `src/services/parseLLMJson.ts` — one function that handles fence stripping, `JSON.parse`, and Zod validation.
- `src/services/prompts/entryMetadata.ts`, `entryThemes.ts`, `profile.ts` — prompt templates in the existing `prompts/` directory.
- `src/services/models.ts` — model IDs and default token limits.
- `entryProcessor.ts` becomes a thin orchestrator importing from all three.

## Implementation Steps

### 1. Create `src/services/parseLLMJson.ts`

```typescript
import type { ZodSchema } from 'zod'

export class LLMParseError extends Error {
  constructor(message: string, public raw: string, public cause?: unknown) {
    super(message)
    this.name = 'LLMParseError'
  }
}

export function parseLLMJson<T>(raw: string, schema: ZodSchema<T>): T {
  // Strip markdown code fences and trailing prose
  const cleaned = raw
    .replace(/^```(?:json)?\n?/gm, '')
    .replace(/^```\n?/gm, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    throw new LLMParseError('Failed to parse LLM response as JSON', raw, e)
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new LLMParseError(
      `LLM response failed schema validation: ${result.error.message}`,
      raw,
      result.error,
    )
  }
  return result.data
}
```

### 2. Create `src/services/models.ts`

```typescript
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
export const OPUS_MODEL = 'claude-opus-4-6'

export const TOKEN_LIMITS = {
  entryMetadata: 500,
  themeExtraction: 4000,
  profileNarrative: 4000,
  fullProfile: 8000,
  chatResponse: 8000,
  sessionSummary: 300,
} as const
```

### 3. Move prompts to `src/services/prompts/`

Create three files alongside the existing prompt files in `src/services/prompts/`:

- `entryMetadata.ts` — exports the system prompt for entry metadata extraction (currently at `entryProcessor.ts:21-30`).
- `entryThemes.ts` — exports the system prompt for theme extraction (currently at `entryProcessor.ts:95-108`).
- `profile.ts` — exports the system prompt for full profile generation (currently at `entryProcessor.ts:151-200`).

Each file exports a `systemPrompt` string and optionally a `buildUserMessage(entries)` function.

### 4. Refactor `entryProcessor.ts`

Replace the three inline parse-and-validate blocks with calls to `parseLLMJson`. Replace inline prompts with imports. Replace model ID strings with imports from `models.ts`. The file shrinks from 265 to ~120 lines of pure orchestration.

### 5. Refactor `ChatView.tsx:174`

Replace:

```typescript
model: selectedModel || 'claude-haiku-4-5-20251001'
```

With:

```typescript
import { HAIKU_MODEL } from '../../services/models'
model: selectedModel || HAIKU_MODEL
```

## Files to Modify

- **New**: `src/services/parseLLMJson.ts`
- **New**: `src/services/models.ts`
- **New**: `src/services/prompts/entryMetadata.ts`
- **New**: `src/services/prompts/entryThemes.ts`
- **New**: `src/services/prompts/profile.ts`
- **New**: `src/__tests__/services/parseLLMJson.test.ts`
- **Modify**: `src/services/entryProcessor.ts` — import from the new modules.
- **Modify**: `src/components/chat/ChatView.tsx` — import model ID from `models.ts`.

## Dependencies

None.

## Testing Notes

### Unit

`src/__tests__/services/parseLLMJson.test.ts`:

```ts
describe('parseLLMJson', () => {
  it('parses plain JSON and validates against the schema', () => {
    /**
     * The simplest case: the LLM returns a clean JSON string with no markdown
     * fencing. parseLLMJson strips nothing and delegates straight to JSON.parse
     * + Zod validation. This test verifies the baseline contract.
     * Input: '{"value": 7, "label": "good"}' with MoodScoreSchema
     * Expected output: { value: 7, label: 'good' }
     */
  })

  it('strips markdown json code fences before parsing', () => {
    /**
     * Claude frequently wraps JSON responses in ```json ... ``` blocks.
     * The fence-stripping logic must handle this transparently so callers
     * never need to pre-process the response.
     * Input: '```json\n{"value": 7}\n```' with a schema
     * Expected output: parsed object matching the schema
     */
  })

  it('strips fences with trailing prose after the closing fence', () => {
    /**
     * Sometimes Claude adds explanatory text after the closing ```. The
     * parser must ignore trailing prose and parse only the JSON.
     * Input: '```json\n{"value": 7}\n```\nHere is the result.'
     * Expected output: { value: 7 } — trailing prose ignored
     */
  })

  it('throws LLMParseError on invalid JSON', () => {
    /**
     * If the LLM returns something that is not valid JSON (e.g. truncated
     * output due to max_tokens), the error must be clear and typed so callers
     * can distinguish parse failures from schema failures.
     * Input: '{invalid'
     * Expected output: throws LLMParseError with name 'LLMParseError'
     */
  })

  it('throws LLMParseError on valid JSON that fails the schema', () => {
    /**
     * The LLM might return valid JSON that does not match the expected shape
     * (e.g. missing required fields). This must throw with the Zod error
     * attached as `cause` so callers can inspect which field failed.
     * Input: '{"wrong": "shape"}' with a strict schema
     * Expected output: throws LLMParseError with cause containing ZodError
     */
  })
})
```

### Manual

1. `npm test` — all existing `entryProcessor` tests must still pass (they test `computeLocalStats`, which doesn't change).
2. `npm run build` — no type errors.
3. Trigger "Update Index" with a few unindexed entries. Confirm metadata is extracted as before.

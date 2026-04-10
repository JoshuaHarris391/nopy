# 09 — Semantic Embedding Retrieval Over Index Summaries

## Problem

Task 06 adds keyword-based retrieval, which handles explicit term matches ("work stress" → entries tagged "work stress"). But keyword matching fails for **semantic similarity** — when the user says "I'm feeling the same way I did after that argument with my dad", the relevant entry might use words like "conflict", "family tension", or "frustration" with no direct keyword overlap. Embedding-based retrieval captures meaning, not just words.

This task adds a local embedding layer that runs entirely on-device with no external API. It operates over the existing Haiku-generated `summary` field on each indexed entry, making it a natural extension of the current indexing pipeline.

## Relationship to Task 06

Task 06 (keyword retrieval) should be implemented first — it's simpler and provides immediate value. This task **extends** the `src/services/entryRetrieval.ts` module created in task 06 by adding a `scoreEntriesBySemantic()` function. The context assembler can then combine both signals: keyword score + cosine similarity, with a weighted blend.

## Architecture

### Embedding Model

- **Model**: `all-MiniLM-L6-v2` (22MB ONNX, 384-dimensional vectors, English-optimised)
- **Runtime**: ONNX Runtime via the `ort` Rust crate, exposed as a Tauri command
- **Why Rust-side**: Native ONNX Runtime is 5-10× faster than WASM (Transformers.js). The Tauri backend already exists. Embedding a summary takes ~5ms on CPU.
- **Alternative (simpler, slower)**: `@huggingface/transformers` in a Web Worker on the frontend. Consider this if avoiding Rust changes is preferred — see the appendix at the bottom.

### Data Flow

```
Entry indexed by Haiku → summary written to frontmatter
                       → summary embedded locally → 384-dim vector stored in IndexedDB
                       
User sends chat message → message embedded locally
                        → cosine similarity vs all stored vectors
                        → top-N entries injected into context
```

### Vector Storage

Vectors are stored in IndexedDB under key `entry-vectors` as a map: `Record<entryId, Float32Array>`. At 1,825 entries × 384 floats × 4 bytes = **~2.8MB** — trivially small.

Vectors are **disposable** — delete the `entry-vectors` key and they rebuild from summaries on next index. They are never written to disk or markdown files.

## Implementation Steps

### 1. Add ONNX Runtime to the Rust backend

Update `src-tauri/Cargo.toml`:
```toml
[dependencies]
ort = { version = "2", features = ["download-binaries"] }
tokenizers = "0.20"
```

Download `all-MiniLM-L6-v2` as an ONNX file. Store at `src-tauri/models/all-MiniLM-L6-v2.onnx` (bundled with the app) or download on first run to the app data directory.

### 2. Create a Tauri command for embedding

In `src-tauri/src/lib.rs` (or a new `src-tauri/src/embeddings.rs` module):

```rust
use ort::{Session, Value};
use std::sync::Mutex;
use tauri::State;

struct EmbeddingModel(Mutex<Option<Session>>);

#[tauri::command]
async fn embed_text(
    text: String,
    model: State<'_, EmbeddingModel>,
) -> Result<Vec<f32>, String> {
    let guard = model.0.lock().map_err(|e| e.to_string())?;
    let session = guard.as_ref().ok_or("Model not loaded")?;
    
    // Tokenize, run inference, mean-pool, normalize
    // Return 384-dim f32 vector
    // (Full tokenization + inference implementation needed here)
    
    todo!()
}

#[tauri::command]
async fn embed_batch(
    texts: Vec<String>,
    model: State<'_, EmbeddingModel>,
) -> Result<Vec<Vec<f32>>, String> {
    // Batch version for embedding many summaries at once during indexing
    todo!()
}
```

Register the model as Tauri managed state and lazy-load the ONNX session on first use.

### 3. Create `src/services/embeddingService.ts` on the frontend

```typescript
import { invoke } from '@tauri-apps/api/core'

/**
 * Embed a single text string using the local ONNX model.
 * Returns a 384-dimensional float array.
 */
export async function embedText(text: string): Promise<Float32Array> {
  const vector = await invoke<number[]>('embed_text', { text })
  return new Float32Array(vector)
}

/**
 * Embed multiple texts in a single batch call.
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const vectors = await invoke<number[][]>('embed_batch', { texts })
  return vectors.map((v) => new Float32Array(v))
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
```

### 4. Store vectors in IndexedDB

Create `src/services/vectorStore.ts`:

```typescript
import { get, set } from 'idb-keyval'

const VECTORS_KEY = 'entry-vectors'

// Stored as serialisable format (plain number arrays)
type VectorMap = Record<string, number[]>

export async function loadVectors(): Promise<Map<string, Float32Array>> {
  const raw = await get<VectorMap>(VECTORS_KEY)
  if (!raw) return new Map()
  const map = new Map<string, Float32Array>()
  for (const [id, vec] of Object.entries(raw)) {
    map.set(id, new Float32Array(vec))
  }
  return map
}

export async function saveVector(entryId: string, vector: Float32Array): Promise<void> {
  const raw = (await get<VectorMap>(VECTORS_KEY)) ?? {}
  raw[entryId] = Array.from(vector)
  await set(VECTORS_KEY, raw)
}

export async function saveVectorsBatch(vectors: Map<string, Float32Array>): Promise<void> {
  const existing = (await get<VectorMap>(VECTORS_KEY)) ?? {}
  for (const [id, vec] of vectors) {
    existing[id] = Array.from(vec)
  }
  await set(VECTORS_KEY, existing)
}

export async function removeVector(entryId: string): Promise<void> {
  const raw = (await get<VectorMap>(VECTORS_KEY)) ?? {}
  delete raw[entryId]
  await set(VECTORS_KEY, raw)
}
```

### 5. Embed summaries during the indexing pipeline

In `src/stores/journalStore.ts` or `src/stores/profileStore.ts` — wherever entries are processed by Haiku and summaries are written — add an embedding step after each summary is generated:

```typescript
// After Haiku returns metadata for an entry:
const metadata = await processEntry(entry, apiKey, signal)

// Embed the summary locally (fast, no API call)
const vector = await embedText(metadata.summary)
await saveVector(entry.id, vector)
```

For bulk operations (`processAllEntries`), use `embedBatch` to embed all new summaries in one call.

### 6. Add semantic scoring to `src/services/entryRetrieval.ts`

Extend the module created in task 06:

```typescript
import { embedText, cosineSimilarity } from './embeddingService'
import { loadVectors } from './vectorStore'

/**
 * Score entries by semantic similarity to a query.
 * Uses local embeddings — no API call.
 */
export async function scoreEntriesBySemantic(
  entries: JournalEntry[],
  query: string,
  limit: number = 20,
): Promise<ScoredEntry[]> {
  const vectors = await loadVectors()
  if (vectors.size === 0) return []
  
  const queryVector = await embedText(query)
  
  return entries
    .filter((e) => e.indexed && vectors.has(e.id))
    .map((entry) => ({
      entry,
      score: cosineSimilarity(queryVector, vectors.get(entry.id)!),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Combined scoring: blend keyword + semantic signals.
 * Requires task 06 (keyword) to be implemented first.
 */
export async function scoreEntriesCombined(
  entries: JournalEntry[],
  query: string,
  limit: number = 20,
): Promise<ScoredEntry[]> {
  const [keyword, semantic] = await Promise.all([
    Promise.resolve(scoreEntriesByRelevance(entries, query, limit * 2)),
    scoreEntriesBySemantic(entries, query, limit * 2),
  ])
  
  // Normalise scores to 0-1 range, then blend
  const maxKeyword = Math.max(...keyword.map((s) => s.score), 1)
  const maxSemantic = Math.max(...semantic.map((s) => s.score), 0.01)
  
  const combined = new Map<string, { entry: JournalEntry; score: number }>()
  
  for (const s of keyword) {
    combined.set(s.entry.id, {
      entry: s.entry,
      score: (s.score / maxKeyword) * 0.4,  // 40% keyword weight
    })
  }
  
  for (const s of semantic) {
    const existing = combined.get(s.entry.id)
    const semanticScore = (s.score / maxSemantic) * 0.6  // 60% semantic weight
    if (existing) {
      existing.score += semanticScore
    } else {
      combined.set(s.entry.id, { entry: s.entry, score: semanticScore })
    }
  }
  
  return [...combined.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
```

### 7. Update context assembler

In `src/services/contextAssembler.ts`, replace the `scoreEntriesByRelevance` call (added in task 06) with `scoreEntriesCombined`:

```typescript
// Task 06 version:
const relevantEntries = scoreEntriesByRelevance(relevantCandidates, query, RELEVANT_LIMIT)

// Task 09 upgrade:
const relevantEntries = await scoreEntriesCombined(relevantCandidates, query, RELEVANT_LIMIT)
```

Note: `assembleContext` becomes `async` with this change, so update the signature and all call sites.

### 8. Graceful degradation

If the ONNX model fails to load (e.g., file missing, Rust panic), or if running in the browser without Tauri:
- `embedText` should catch and return `null`
- `scoreEntriesBySemantic` should return `[]`
- `scoreEntriesCombined` falls back to keyword-only scoring
- Log a warning but don't break the chat flow

## Appendix: Web Worker Alternative (No Rust Changes)

If avoiding Rust/Cargo changes is preferred, use `@huggingface/transformers` in a Web Worker:

```bash
npm install @huggingface/transformers
```

Create `src/workers/embedding.worker.ts`:
```typescript
import { pipeline } from '@huggingface/transformers'

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null

self.onmessage = async (e: MessageEvent) => {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'fp32',
    })
  }
  const { id, texts } = e.data
  const results = await embedder(texts, { pooling: 'mean', normalize: true })
  self.postMessage({ id, vectors: results.tolist() })
}
```

Tradeoffs vs Rust approach:
- **Slower**: ~30-50ms per embedding vs ~5ms native
- **Larger first load**: ~22MB WASM + model download, cached after first use
- **No Cargo.toml changes**: purely frontend
- **Works in browser dev mode**: no Tauri required for testing

## Files to Modify

- **New**: `src-tauri/src/embeddings.rs` (or add to `lib.rs`) — ONNX model loading + Tauri commands
- **Modify**: `src-tauri/Cargo.toml` — add `ort` and `tokenizers` crates
- **Modify**: `src-tauri/src/lib.rs` — register embedding commands and managed state
- **New**: `src/services/embeddingService.ts` — frontend wrapper for Tauri embed commands
- **New**: `src/services/vectorStore.ts` — IndexedDB vector storage
- **Modify**: `src/services/entryRetrieval.ts` (from task 06) — add `scoreEntriesBySemantic` and `scoreEntriesCombined`
- **Modify**: `src/services/contextAssembler.ts` — use combined scoring, make function async
- **Modify**: `src/stores/journalStore.ts` or `src/stores/profileStore.ts` — embed summaries during indexing

## Dependencies

### Rust (recommended path)
- `ort = "2"` with `download-binaries` feature (ONNX Runtime)
- `tokenizers = "0.20"` (HuggingFace tokenizer for MiniLM)
- `all-MiniLM-L6-v2.onnx` model file (~22MB, bundled or downloaded on first run)

### JS alternative
- `@huggingface/transformers` (npm package)

## Testing Notes

- **Embedding quality**: Embed "I had a fight with my father" and "argument with dad" — cosine similarity should be > 0.7. Embed "I had a fight with my father" and "I went grocery shopping" — similarity should be < 0.3.
- **Index pipeline**: Process a new entry. Verify a vector is stored in IndexedDB under `entry-vectors` with key matching the entry ID. Vector should have exactly 384 dimensions.
- **Retrieval**: In a chat, reference an emotional theme from an old entry without using exact keywords. Verify the old entry appears in the context assembler's injected index (check console logs).
- **Combined scoring**: Verify that entries matching both keyword and semantic signals rank highest.
- **Graceful degradation**: Kill the ONNX model (rename the file). Verify chat still works with keyword-only retrieval. Check console for a warning, not an error.
- **Performance**: Embedding a single summary should take < 10ms (Rust) or < 50ms (WASM). Cosine similarity over 1,825 vectors should take < 5ms.
- **Storage**: Verify `entry-vectors` in IndexedDB is < 3MB at 1,825 entries. Deleting the key and re-indexing should rebuild all vectors.
- **Bulk embed**: During a full reindex of 100+ entries, verify `embedBatch` is used (not 100 individual `embedText` calls).

# Local LLM Integration

Run nopy entirely on your own Mac, with no data leaving the machine.

**Audience:** technical users and contributors. For the high-level pipeline (Anthropic-side), see [`llm-pipeline.md`](./llm-pipeline.md). For the design/spec context, see [`../tasks/10-gemma4-local-integration.md`](../tasks/10-gemma4-local-integration.md).

**Contents**

- [Overview](#overview)
- [What you need](#what-you-need)
- [Setup walk-through](#setup-walk-through)
- [The surface area it touches](#the-surface-area-it-touches)
- [Security & local data](#security--local-data)
- [Provider switching](#provider-switching)
- [Errors you might see](#errors-you-might-see)
- [What's still on Anthropic](#whats-still-on-anthropic)
- [Verification](#verification)
- [Limitations & v2](#limitations--v2)

---

## Overview

**Local mode** routes every AI call in nopy — chat, journal indexing, profile generation, title generation — to a model running on your Mac via [LM Studio](https://lmstudio.ai/). No prompts, journal entries, summaries, or psychological profile content leave your machine in this mode.

What it isn't: an embedded model. nopy doesn't ship inference code itself; LM Studio handles the model loading, quantization, and Metal-accelerated inference. nopy just speaks LM Studio's OpenAI-compatible HTTP API on `http://localhost:1234/v1`. If LM Studio isn't running, the AI features sit idle and the UI tells you what to do.

The same chat UX, settings layout, and journal flow apply in both modes — toggling provider in Settings is meant to feel like flipping a switch, not entering a different app.

## What you need

- **Mac with ≥ 16 GB RAM** for the recommended model. 8 GB Macs work but you'll want the smaller fallback.
- **[LM Studio](https://lmstudio.ai/)** installed and the local server enabled.
- **One model loaded** in LM Studio. Recommended for 16 GB Macs:
  - **Gemma 4 E4B (Q4_K_M)** — ~5 GB resident, good quality. Default we guide users toward.
  - **Gemma 4 E2B (Q4_K_M)** — ~2 GB resident, fallback for older M1 Air-class machines.

### A note on which LM Studio endpoint we use

LM Studio exposes **two** HTTP APIs when "Start Server" is clicked:

| Endpoint | Path | Request shape | Used by nopy? |
|---|---|---|---|
| OpenAI-compatible | `/v1/chat/completions`, `/v1/models` | Standard OpenAI (`messages: [{role, content}]`, `stream: true`, etc.) | **Yes** |
| LM Studio native REST API | `/api/v1/chat`, `/api/v1/models` | LMS-specific (`system_prompt: string`, `input: string`) | No |

We use the **OpenAI-compatible** path because it's the cross-tool standard — the same client code works against Ollama, llama.cpp's server, and any other OpenAI-compatible runtime. LM Studio's "use in code" snippets sometimes default to the native REST API; if you copy one of those URLs (`http://localhost:1234/api/v1`) into nopy's Base URL field, the normalizer will quietly rewrite it to `http://localhost:1234/v1` so the request still reaches the right endpoint.

## Setup walk-through

If you prefer to skip the in-app onboarding card, here's what it walks you through:

1. **Install LM Studio.** From [lmstudio.ai](https://lmstudio.ai/). The in-app "Download LM Studio" button on nopy's settings page opens the same URL via the system browser.
   `![placeholder: in-app Download LM Studio button]`
2. **Open the Developer tab and click "Start Server".** LM Studio's server starts on `http://localhost:1234`. The status indicator in nopy's settings will turn from coral ("not running") to amber ("running, no model loaded") within a few seconds — click the **Check again** button if you want to verify immediately.
   `![placeholder: LM Studio Developer tab Start Server]`
3. **Search for and load a model.** In LM Studio, search "Gemma 4 E4B", click **Download** (one-time, ~5 GB), then **Load** in the right-hand pane.
   `![placeholder: LM Studio model search + Load button]`
4. **In nopy → Settings → AI Provider, click Local.** The status indicator will go green ("Ready") once your loaded model id appears in the autocomplete.
   `![placeholder: nopy Settings with Local toggle and green Ready indicator]`
5. **Type the model id into the Model field.** Either paste from LM Studio or pick from the autocomplete suggestions populated by `GET /v1/models`. Common ids look like `google/gemma-4-e4b` or `lmstudio-community/Gemma-2-2B-it-GGUF`. The exact string LM Studio reports is what the API expects.
   `![placeholder: nopy model input with autocomplete]`

That's it. Send a chat message; it streams from your local model. Run "Update Index" on the journal; entries get summarised by the same model.

## The surface area it touches

Concretely, here is everything local mode affects:

**Settings store** — three new fields persisted in `localStorage` under `nopy-settings`:

| Field | Default | Purpose |
|---|---|---|
| `provider` | `'anthropic'` | Active provider. `'anthropic'` keeps every existing user on the cloud path. |
| `localBaseUrl` | `'http://localhost:1234/v1'` | Where to find LM Studio's OpenAI-compatible endpoint. |
| `localModel` | `''` | The exact model id LM Studio reports. Free-text, autocompleted from `/v1/models`. |

A `version: 1` migration in the persist middleware fills these in for existing v0 blobs without losing any other settings.

**Network egress in local mode**:

- `POST {localBaseUrl}/chat/completions` — chat send, title generation, entry summarisation, profile narrative, full profile (all routed through `services/localServer.ts`).
- `GET {localBaseUrl}/models` — settings-page probe (drives the status indicator and model autocomplete).
- One outbound call to `https://lmstudio.ai/` — only when you click **Download LM Studio** in the onboarding card. Opens via `tauri-plugin-opener` in the system browser.

**Zero requests to `api.anthropic.com`** while in local mode. You can verify this in the DevTools Network tab — see [Verification](#verification) below.

**Code paths**:

- Chat send: `ChatView.tsx` → `services/llm.ts` → `services/localServer.ts` → `fetch(localhost:1234)`.
- Indexing: `entryProcessor.ts` (called from `journalStore.processEntries` and `profileStore.generateProfile`) → `services/llm.ts` → `services/localServer.ts`.
- Settings UI: `ApiSection.tsx` mounts `LocalBlock.tsx`, which uses `useLocalModels()` to probe and `LocalOnboardingCard.tsx` for the install flow.

**Files written**: identical to Anthropic mode (`chat.ndjson` and `entries/*.md` under `journalPath`, plus IDB caches). No local-provider-specific files are created.

**Tauri capabilities** (in `src-tauri/capabilities/default.json`):
- `opener:default` — powers the "Download LM Studio" link.
- `http:default` scoped to `http://localhost:*`, `http://127.0.0.1:*`, and `http://0.0.0.0:*` — lets the LM Studio fetches go through Rust's reqwest (`tauri-plugin-http`) instead of the WebView's fetch. Without this, the WebView blocks responses from LM Studio because LM Studio doesn't send `Access-Control-Allow-Origin` headers (CORS), even though the request itself succeeds. Routing through Rust bypasses the browser's same-origin policy entirely.

## Security & local data

What's **guaranteed**:

- In local mode, prompt and response data never leave the loopback interface. `services/llm.ts` resolves `provider === 'local'` to `services/localServer.ts`, which only fetches `localhost`. There is no fall-through to Anthropic.
- The Anthropic API key field is *hidden* in local mode (the UI mounts `LocalBlock` instead of `AnthropicBlock`), but more importantly the dispatcher's routing is provider-driven, not key-driven — even if you had a stale key in the store, no Anthropic call can fire while `provider === 'local'`.
- The "Download LM Studio" button is the only outbound call from nopy in local mode, and it goes through `tauri-plugin-opener` to your system browser. nopy does not phone home.
- The chat-context assembler (`src/services/contextAssembler.ts`) is provider-agnostic — the same `{ system, messages }` shape feeds both providers. There's no place for local-mode prompts to leak through an Anthropic-only code path.

What's **not** guaranteed:

- LM Studio is third-party software. nopy doesn't control what LM Studio does with the prompt before passing it to the model. Refer to LM Studio's own privacy policy.
- Model output quality. Gemma 4 E4B (Q4) is a smart small model, but it produces noticeably less polished profile narratives and full-profile documents than Anthropic's Opus. This is an opt-in trade.
- Hallucination protection. Local models hallucinate too. The journal-content grounding in `contextAssembler.ts` is the same defence for both providers — strong but not perfect.
- Latency. LM Studio is single-threaded for inference. The post-chat title-generation call queues behind the chat itself, so titles appear with a slight delay on slower models.

## Provider switching

- **Toggling Anthropic ↔ Local** flips `settings.provider` and re-mounts the per-provider settings block. **Your other settings are preserved** — the API key, the local base URL, and the local model name persist independently. Toggling back doesn't clobber either side's setup.
- **Mid-session switch.** If you switch provider while a chat session has messages, future sends use the new provider. The session itself is not tagged per-message in v1, so a session can contain mixed-provider replies — that's fine for chat coherence, but worth knowing if you're auditing.
- **Mid-stream switch.** If you switch provider while a chat reply is streaming, the active stream finishes on the original provider (the dispatcher already resolved which module to call). The next message goes to the new provider.

## Errors you might see

`services/llm.ts` exports a single `LlmError` class with stable codes. Errors surface in **two places**:
1. **Inline** — the assistant message placeholder is replaced with the user-facing copy so the chat history shows what happened in context.
2. **Bottom-right notification card** — same fixed-position stack as the indexing / profile-generation progress cards (`AppShell` renders `NotificationCard` for each item in `useNotificationStore`). Coral left-border accent for errors. Auto-dismisses after 8 seconds; click `×` to dismiss earlier.

| Code | When it fires | What the UI says |
|---|---|---|
| `CONNECTION_REFUSED` | `fetch` throws (LM Studio's server isn't running, or the URL is wrong). | "Couldn't reach your local AI. Open LM Studio and click Start Server in the Developer tab." |
| `NO_MODEL_LOADED` | LM Studio returns 400 or 404 from `/chat/completions` (server up, no model clicked Load). | "LM Studio is running but no model is loaded. Open LM Studio, search for a model (e.g. Gemma 4), click Download, then Load." |
| `MODEL_NAME_MISMATCH` | `/v1/models` returned a list, but `settings.localModel` isn't in it (typo or stale name). | "The model name in Settings doesn't match any model loaded in LM Studio. Update the model name or load that model in LM Studio." |
| `NO_MODEL_CONFIGURED` | Local mode active but `settings.localModel === ''`. Caught by the dispatcher *before* any network call. | "Pick a local model in Settings before sending a message." |
| `TIMEOUT` | The probe call (`GET /v1/models`) doesn't respond within 2 seconds. | "Local AI didn't respond in time. Make sure LM Studio is running and a model is loaded." |
| `INVALID_API_KEY` | Anthropic returns 401 (wrong or revoked key). Surfaces in Anthropic mode only. | "Your Anthropic API key isn't valid. Update it in Settings." |
| `RATE_LIMITED` | Provider returns 429. | "Too many requests. Wait a moment and try again." |
| `CONTEXT_TOO_LARGE` | Provider returns 400 with a context-length signal **OR** sends a `data: {"error": "..."}` SSE event mid-stream mentioning context. The localServer parser sniffs both shapes for "context size", "context length", "n_keep" and similar phrases. | "Your prompt is too large for this model's context window. In LM Studio, click Eject and re-load the model with a larger Context Length (Tools → Model loader). For long journal sessions, load a model with at least 32k context." |

## What's still on Anthropic

In local mode: **nothing**.

The Anthropic SDK module (`services/anthropic.ts`) is still imported by `services/llm.ts` as a peer to `services/localServer.ts`, but it's never invoked while `provider === 'local'`. The dispatcher routes by provider, not by what's "available". You can confirm this empirically — see Verification.

## Verification

Open Chrome DevTools (or the WKWebView equivalent in a Tauri build) → **Network** tab. Then:

1. **In Local mode, send a chat message.** You should see a `POST` to `http://localhost:1234/v1/chat/completions` and zero requests to `api.anthropic.com`.
2. **Run "Update Index" on the journal.** Same — only `localhost:1234` requests; nothing goes to Anthropic.
3. **Generate a profile in `ProfileView`.** Multiple `POST`s to `localhost:1234`, one per phase (entry processing → narrative → full profile). Still zero Anthropic.
4. **Toggle back to Anthropic and repeat.** Now you'll see `api.anthropic.com` traffic and zero `localhost:1234` traffic.

Combined with the dispatcher's unit tests in `src/__tests__/services/llm.test.ts` (which assert provider routing and that `requestedModel` is overridden in local mode), this gives both runtime and compile-time evidence that local mode contains all data.

## Limitations & v2

- **One model at a time.** LM Studio's constraint, not nopy's. Switching models requires unloading and loading in LM Studio.
- **No automatic Ollama support yet.** The OpenAI-compatible client in `services/localServer.ts` *can* point at Ollama (`http://localhost:11434/v1`) — just paste that URL into the Base URL field. There's no in-app Backend dropdown yet because LM Studio is the only one we onboard non-technical users into.
- **No embedded inference.** Plan B in [`../tasks/10-gemma4-local-integration.md`](../tasks/10-gemma4-local-integration.md) discusses moving inference into the Tauri Rust sidecar so nopy is one tidy install. That's future work.
- **Quality vs. Anthropic Opus.** The full-profile pipeline uses Opus 4.6 in Anthropic mode (~10k tokens of clinical analysis). On Gemma 4 E4B Q4 the same prompt produces a notably shorter and less nuanced profile. If profile quality matters and privacy doesn't, stay on Anthropic for that step. v1 doesn't allow per-feature provider overrides; that's on the v2 list.
- **Multi-byte streaming**. SSE chunks split mid-codepoint occasionally; `services/localServer.ts` uses `TextDecoder({ stream: true })` and is unit-tested for this case. If you see corrupted CJK or emoji in streamed responses, file an issue with the model id and prompt — it's almost certainly a parser regression.

For the broader roadmap (Plans B, C, D and rationale), see [`../tasks/10-gemma4-local-integration.md`](../tasks/10-gemma4-local-integration.md).

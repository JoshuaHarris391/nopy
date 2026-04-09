# 05 — Wire Up Progressive Chat Session Summarisation

## Problem

The chat session summarisation system is half-built. The storage and context injection are wired up, but **summaries are never generated**:

- `updateSessionSummary` exists in `src/stores/chatStore.ts:167-182` but is **never called** anywhere in the codebase
- `session.summary` is always `null`, so the summary injection in `src/services/contextAssembler.ts:85-96` is dead code
- The current threshold (`session.messages.length > 20`) is a hard cliff — context is fine at 20 messages, then suddenly truncated at 21 with no summary to compensate
- Long conversations lose earlier context permanently when messages are dropped at the token budget boundary (`contextAssembler.ts:118-120`)

## Current Behaviour

### Summary injection (dead code) — `src/services/contextAssembler.ts:85-96`
```typescript
if (session.summary && session.messages.length > 20) {
  messages.push({
    role: 'user',
    content: `[Continuing a previous conversation. Summary of earlier discussion: ${session.summary}]`,
  })
  messages.push({
    role: 'assistant',
    content: "I remember our conversation. Let's continue from where we left off.",
  })
}
```

### Summary storage (never triggered) — `src/stores/chatStore.ts:167-182`
```typescript
updateSessionSummary: async (id, summary) => {
  const session = await get<ChatSession>(`chat:session:${id}`)
  if (session) {
    session.summary = summary
    await set(`chat:session:${id}`, session)
  }
  // ...updates meta and active session
},
```

### Message truncation (no fallback) — `src/services/contextAssembler.ts:110-124`
When the token budget is exceeded, older messages are silently dropped with no summary to preserve their content.

## Desired Behaviour

- After every N assistant messages (e.g., every 8 message pairs = 16 messages), generate a rolling summary of the conversation so far
- The summary is stored via `updateSessionSummary` and included in future context assembly
- When older messages are dropped due to token budget, the summary preserves their key points
- Summary generation happens in the background after the assistant's response is finalised — it should not block the chat flow
- The summary is updated incrementally (include the previous summary + new messages, not the full history)

## Implementation Steps

### 1. Create a summary generation function

Add to `src/services/entryProcessor.ts` (or a new `src/services/chatProcessor.ts`):

```typescript
const SUMMARY_INTERVAL = 16  // every 16 messages (8 exchanges)

export async function generateSessionSummary(
  messages: ChatMessage[],
  previousSummary: string | null,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const context = previousSummary
    ? `Previous conversation summary:\n${previousSummary}\n\nNew messages since last summary:\n`
    : 'Conversation so far:\n'
  
  const messageText = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n')
  
  const response = await sendMessage(
    apiKey,
    HAIKU_MODEL,
    `Summarise this therapy/journaling conversation in 2-4 sentences. Capture: the main topics discussed, any insights or breakthroughs, the emotional trajectory, and where the conversation left off. Be specific — name people, events, and emotions mentioned. This summary will be used to maintain context in future messages.`,
    [{ role: 'user', content: context + messageText }],
    300,
    signal,
  )
  return response.trim()
}
```

### 2. Trigger summarisation after message finalisation

In the chat flow (wherever `finaliseStreamingMessage` is called or after assistant response completion), add logic to check if summarisation is due:

```typescript
// After assistant message is finalised
const session = getState().activeSession
if (session && session.messages.length > 0 && session.messages.length % SUMMARY_INTERVAL === 0) {
  // Fire and forget — don't block the chat
  generateSessionSummary(
    session.messages.slice(-(SUMMARY_INTERVAL + 4)), // recent messages + overlap
    session.summary,
    apiKey,
  ).then((summary) => {
    useChatStore.getState().updateSessionSummary(session.id, summary)
  }).catch((e) => {
    console.error('[chat] Failed to generate session summary:', e)
  })
}
```

Find where `finaliseStreamingMessage` is called — likely in a chat component or a `sendMessage` handler — and add the trigger there.

### 3. Update context assembler threshold

In `src/services/contextAssembler.ts:85`, change the condition:

```typescript
// Before: hard cliff at 20
if (session.summary && session.messages.length > 20) {

// After: inject summary whenever one exists
if (session.summary) {
```

The summary will be present whenever the conversation has passed a summary checkpoint. The `> 20` guard is no longer needed because summaries are generated progressively.

### 4. Find the chat send/response handler

Search for where the chat message flow is orchestrated — likely in `src/components/chat/` or a service. This is where `addMessage`, streaming, and `finaliseStreamingMessage` are called in sequence. The summary trigger hooks in after the final `finaliseStreamingMessage` call.

Use `grep -r "finaliseStreamingMessage" src/` to find call sites.

## Files to Modify

- **New or Modify**: `src/services/chatProcessor.ts` (or add to `entryProcessor.ts`) — summary generation function
- **Modify**: The chat component/service that orchestrates message send → stream → finalise (find via grep for `finaliseStreamingMessage`)
- **Modify**: `src/services/contextAssembler.ts` — relax the summary injection condition (line 85)

## Dependencies

None — uses existing Haiku model and `sendMessage`.

## Testing Notes

- Start a new chat session, send 16+ messages. Verify a summary is generated (check IndexedDB `chat:session:<id>` → `summary` field).
- Continue chatting past 32 messages. Verify the summary updates (should reference both early and recent conversation).
- Reload the page, open the same session, and send a new message. Verify the summary is injected into context (check console logs from contextAssembler).
- Verify summarisation does **not** block the chat — the assistant's next response should be available immediately, with summarisation happening in the background.
- Test abort/cancel during summarisation — should fail silently without affecting the chat.
- Verify the summary content is useful — it should mention specific topics, people, and emotional states from the conversation.

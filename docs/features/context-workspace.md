# Context Workspace

> A dedicated home for everything that can be fed to your AI companion — your own
> notes and documents, plus your psychological profile and journal index — with
> precise, visible control over *what* gets injected, *in what order*, and *how
> much* of your model's context window it costs.

**Status:** Proposed (implementation spec: [`docs/tasks/10-context-workspace.md`](../tasks/10-context-workspace.md))

---

## Why this exists

When you start a chat in nopy, the app quietly stitches background material into the
system prompt so your companion already knows you: your **psychological profile** and a
**table of your recent journal entries**. This is great — until it isn't.

That background material is large. A full psychological profile is a multi-thousand-word
clinical document, and the entry index adds dozens more rows. On a big hosted model
(200K+ token windows) you'll never notice. But if you're:

- running a **small local model** in LM Studio or Ollama (often a 4K–8K token window),
- using a **cheaper/smaller hosted model** to save money, or
- simply someone who wants a **lean, fast** prompt,

…then that automatic context can eat your whole window before you've typed a word — or
make every message slower and more expensive than it needs to be.

Until now there was no way to see that cost or change it. The **Context Workspace** turns
this hidden, all-or-nothing behaviour into something you can see and steer.

---

## Key concepts

### Context items

Everything in the workspace is a **context item**. There are three kinds:

| Kind | What it is | Editable here? |
|---|---|---|
| **Note** | A markdown document you write — anything you want your companion to know | Yes |
| **Profile** | Your generated psychological profile | No (edit via **Profile**) |
| **Index** | The table of your indexed journal entries | No (managed via **Index**) |

Notes are yours to fill however you like — past relationships, your childhood and
upbringing, a breakthrough you had, values you're working toward, context about people in
your life, content warnings, "please call me by this name," whatever helps. The Profile
and Index show up **automatically** as special system cards so they live alongside your
notes in one place.

### Injection

An item is either **injected** (sent to the model with every message in a chat) or just
**stored** (kept for your reference, never sent). You decide per item. Want a profound,
deeply-personalised companion? Inject everything. Running a tiny local model? Inject
nothing, or just one short note. It's entirely your call.

### Order

For the items you *do* inject, **order matters**. Models pay attention differently to
material depending on where it sits in the prompt. In the Context Workspace, injected items
sit on a **shelf** at the top — highlighted, and arranged left-to-right. That order *is* the
order they're placed into the prompt (leftmost goes in first).

---

## The Context view

Open **Context** from the sidebar. You'll see a **shelf** of injected cards on top and a
**grid** of square note tiles below:

```
┌────────────────────────────────────────────────────────────┐
│  Context window: LM Studio · 8,192 tokens                   │
│  [▓ base ▓▓▓▓ injected ▓▓▓▓|·· headroom ··|     free     ]  │
│                                  ▲ getting full              │
├────────────────────────────────────────────────────────────┤
│  SHELF — injected, in order (left = first)        ⟵ scroll  │
│   ┌──①───┐ ┌──②───┐ ┌──③──────┐                            │
│   │ ◎     │ │ ▤     │ │ ✎        │                           │
│   │Profile│ │ Index │ │Dad       │                           │
│   │~2,400 │ │ ~900  │ │~480 tok  │                           │
│   │   ◀ ▶ ✕│ │  ◀ ▶ ✕│ │  ◀ ▶ ✕  │   ← highlighted          │
│   └───────┘ └───────┘ └──────────┘                          │
├────────────────────────────────────────────────────────────┤
│  AVAILABLE                                                  │
│   ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐                  │
│   │   +   │ │ ✎     │ │ ✎     │ │ ✎     │                   │
│   │  New  │ │Child- │ │Calm   │ │Work   │  ← square tiles    │
│   │ note  │ │hood   │ │downs  │ │stuff  │     in a grid      │
│   │       │ │ [add] │ │ [add] │ │ [add] │                   │
│   └───────┘ └───────┘ └───────┘ └───────┘                  │
└────────────────────────────────────────────────────────────┘
```

- **The shelf** (top, highlighted): everything currently being sent, **in order, left to
  right**. Drag a card (or use the ◀ ▶ controls) to reorder; ✕ removes it back to the grid.
  Each card shows its token cost. The shelf scrolls sideways when it gets full.
- **The grid** (below): your stored notes as **square tiles**, plus the system cards. Hit
  **add** on a tile to start injecting it — it slides onto the right end of the shelf.
- **System cards** (Profile, Index) carry a distinct icon and can be added and reordered like
  anything else, but you can't edit their contents here — you maintain those in their own
  views. If you haven't generated a profile or indexed any entries yet, those tiles appear
  dimmed with a hint and can't be added.
- **New note / edit**: the **+ New note** tile opens a simple markdown editor (title, body,
  optional tags). Click any note tile to edit it. Notes autosave, just like journal entries.

### Tags

Notes can carry tags (`childhood`, `relationships`, `breakthrough`, …) purely to help *you*
organise and find them. Tags are **not** sent to the model — they're for your eyes.

---

## The injection budget bar

The bar at the top is the heart of the feature. It shows your model's **context window**
and how your choices fill it:

- **base** — the fixed companion/therapy prompt. Always present, small.
- **injected context** — the running total of everything on the shelf, drawn so you can see
  which card tips you over.
- **headroom** — space reserved for the live back-and-forth of the conversation plus the
  model's reply. As you approach this line the bar turns **amber** (your chats will start
  losing older messages sooner); cross the window entirely and it turns **coral**.
- **free** — what's left.

The bar tells you where the window size comes from:

- **Local (LM Studio / Ollama):** read live from the loaded model when LM Studio reports it.
- **Anthropic / OpenAI:** looked up from a built-in table of known model windows.
- **Manual:** if detection is missing or wrong, set the window yourself and your value wins.

Add cards, remove cards, reorder them, and watch the bar respond. That's the whole loop:
**spend as much or as little of your window on context as you want.**

---

## How injection feeds a chat

When you send a message, nopy assembles the system prompt in this order:

1. The base companion/therapy prompt + today's date.
2. **Your injected context items, in the exact order you arranged them.**
3. The focused entry, if you started the chat from a specific journal entry via
   "Explore with nopy" (this is per-conversation and always sits last for maximum
   attention — it's separate from the workspace).
4. Your conversation history, trimmed from the oldest messages to fit what's left of the
   window.

Because the total now respects your model's real window, long conversations on small models
degrade gracefully (older messages drop off) instead of failing outright.

---

## Privacy & storage

Nothing changes about nopy's local-first promise. Your context notes are saved as plain
markdown files in a `context/` folder inside your journal directory, right next to your
entries and chats — readable, portable, and yours. Which items you inject and their order
are saved alongside them, so your setup follows your data folder from machine to machine.
Context is only ever sent to whichever model **you** configured (local or hosted), exactly
like the rest of nopy.

---

## Defaults & upgrading

If you never open the Context Workspace, **nothing changes**: your profile and journal
index stay injected by default, exactly as before. The first time the workspace loads it
seeds that legacy setup (Profile first, Index second, both on) so existing users keep their
current experience until they decide to change it. Any notes you create start out *not*
injected — you opt them in.

---

## Examples

**Running an 8K local model.** Turn the Profile card off, keep one short "what I'm working
on right now" note injected, and leave plenty of headroom for the conversation. The bar
stays green; chats are fast and never overflow.

**Deep, personalised sessions on a big model.** Inject the Profile, the Index, and a
handful of notes about your history and relationships — order the Profile first so it frames
everything. The bar shows you're using a fraction of a 200K window.

**A fresh start.** Toggle everything off. Your companion responds with no background at all —
useful when you want to talk about something completely new without it reaching for old
patterns.

---

## Possible future enhancements

- Full drag-and-drop between the shelf and grid (v1 may ship with add/remove + ◀/▶ controls).
- Importing documents (PDF / DOCX / `.txt`) as notes.
- A user-configurable conversation-headroom setting.
- Making the injected index's entry count adjustable from its card.
- Semantic retrieval that auto-selects the most relevant notes per message
  (see [`docs/tasks/09-semantic-embedding-retrieval.md`](../tasks/09-semantic-embedding-retrieval.md)).

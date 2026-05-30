import { estimateTokens } from '../utils/tokenEstimator'
import type { ChatSession, ChatEntryContext } from '../types/chat'
import type { PsychologicalProfile } from '../types/profile'
import type { JournalEntry } from '../types/journal'
import type { InjectedContextItem } from '../types/context'

interface AssembledContext {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
}

interface AssembleOptions {
  /**
   * Ordered list of context items to inject (from the Context Workspace).
   * - `undefined` → back-compat default: inject profile + index (today's
   *   behaviour, for callers/tests that predate the workspace).
   * - `[]` → inject nothing (the user emptied the shelf).
   * - `[...]` → inject exactly these, in order.
   */
  injectedItems?: InjectedContextItem[]
  /** Model context window in tokens; enables the window-aware message budget. */
  window?: number
  /** Output reserve (max_tokens) kept free for the model's reply. */
  maxOutputTokens?: number
}

const JOURNAL_INDEX_LIMIT = 30

// --- Shared per-kind renderers -------------------------------------------------
// These are the single source of truth for how each context item becomes prompt
// text. Both the assembler (what gets sent) and the Context view's budget bar
// (via resolveContextItems → estimateTokens) call them, so the bar's per-item
// estimate always matches what the model actually receives.

/** Profile block: full profile (or summary fallback) + recurring themes. */
export function renderProfileBlock(profile: PsychologicalProfile | null): string {
  let s = ''
  if (profile?.fullProfile) {
    s += `\n\n## Psychological Profile\n${profile.fullProfile}`
  } else if (profile?.summary) {
    s += `\n\n## Current Psychological Profile\n${profile.summary}`
  }
  if (profile && profile.themes.length > 0) {
    const themesStr = profile.themes.map((t) => t.theme).join(', ')
    s += `\n\nRecurring themes: ${themesStr}`
  }
  return s
}

/** Journal index block: a markdown table of the most recent indexed entries. */
export function renderIndexBlock(entries: JournalEntry[]): string {
  const indexed = entries.filter((e) => e.indexed && e.summary)
  if (indexed.length === 0) return ''
  const sortedEntries = indexed
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, JOURNAL_INDEX_LIMIT)
  const table = sortedEntries
    .map((e) => {
      const date = e.createdAt.slice(0, 10)
      const mood = e.mood ? `${e.mood.value}/10` : '-'
      const tags = e.tags.join(', ') || '-'
      return `| ${date} | ${e.title} | ${mood} | ${tags} | ${e.summary} |`
    })
    .join('\n')
  return `\n\n## Journal Entry Index (${sortedEntries.length} most recent)\n| Date | Title | Mood | Tags | Summary |\n|------|-------|------|------|---------|${table ? '\n' + table : ''}`
}

/** A user note block. */
export function renderNoteBlock(title: string, content: string): string {
  return `\n\n## ${title}\n${content}`
}

/** Render one injected item to prompt text using the source data it needs. */
export function renderInjectedItem(
  item: InjectedContextItem,
  profile: PsychologicalProfile | null,
  entries: JournalEntry[],
): string {
  switch (item.kind) {
    case 'profile':
      return renderProfileBlock(profile)
    case 'index':
      return renderIndexBlock(entries)
    case 'note':
      return renderNoteBlock(item.title, item.content)
    default:
      return ''
  }
}

/** Headroom kept for the live conversation, proportional to the window. */
function conversationReserve(window: number): number {
  return Math.min(Math.max(Math.round(0.2 * window), 2_000), 50_000)
}

export function assembleContext(
  session: ChatSession,
  profile: PsychologicalProfile | null,
  entries: JournalEntry[],
  systemPrompt: string,
  contextBudget: number = 30000,
  entryContext?: ChatEntryContext,
  options: AssembleOptions = {},
): AssembledContext {
  const { injectedItems, window, maxOutputTokens = 0 } = options

  console.log('[contextAssembler] ========== ASSEMBLING CONTEXT ==========')
  console.log('[contextAssembler] Session:', session.id, '| messages:', session.messages.length)
  console.log('[contextAssembler] Budget:', contextBudget, '| window:', window ?? 'n/a', '| injection:',
    injectedItems === undefined ? 'default (profile+index)' : `${injectedItems.length} item(s)`)

  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  let system = systemPrompt + `\n\nToday's date: ${today}`

  if (injectedItems === undefined) {
    // Back-compat: no workspace selection supplied — inject profile + index.
    system += renderProfileBlock(profile)
    system += renderIndexBlock(entries)
  } else {
    // Injection-driven: render the chosen items in order, stopping if the
    // running total would crowd out the live conversation (only when we know
    // the window). Skips are logged — never silently truncated.
    const ceiling = window ? window - maxOutputTokens - conversationReserve(window) : Infinity
    let injectedTokens = estimateTokens(system)
    for (const item of injectedItems) {
      const block = renderInjectedItem(item, profile, entries)
      if (!block) continue
      const blockTokens = estimateTokens(block)
      if (window && injectedTokens + blockTokens > ceiling) {
        console.log('[contextAssembler] ✗ Skipped injected item (over window):', item.kind, item.id, `(${blockTokens} tok)`)
        continue
      }
      system += block
      injectedTokens += blockTokens
      console.log('[contextAssembler] ✓ Injected:', item.kind, item.id, `(${blockTokens} tok)`)
    }
  }

  // Focused entry context last — highest attention position.
  if (entryContext) {
    const dateStr = entryContext.date ? new Date(entryContext.date).toLocaleDateString() : 'undated'
    system += `\n\n## Current Session Focus\nThis journal entry is the focus of the entire session. Reference its specific content throughout the conversation when relevant. Do not ask the user to share it — you have the full text below.\n\n**${entryContext.title}** (${dateStr})\n\n${entryContext.content}`
    console.log('[contextAssembler] ✓ Injected entry context:', entryContext.content.length, 'chars')
  }

  const systemTokens = estimateTokens(system)
  console.log('[contextAssembler] System prompt:', system.length, 'chars |', systemTokens, 'tokens')

  const messages: { role: 'user' | 'assistant'; content: string }[] = []

  // If session has a summary and many messages, inject it as context
  if (session.summary && session.messages.length > 20) {
    messages.push({
      role: 'user',
      content: `[Continuing a previous conversation. Summary of earlier discussion: ${session.summary}]`,
    })
    messages.push({
      role: 'assistant',
      content: "I remember our conversation. Let's continue from where we left off.",
    })
    console.log('[contextAssembler] ✓ Injected session summary')
  }

  // Window-aware message budget: when we know the window, the whole prompt
  // (system + messages) must fit inside `window − maxOutputTokens`. Otherwise
  // fall back to the flat contextBudget (legacy behaviour).
  const effectiveBudget = window ? Math.min(contextBudget, window - maxOutputTokens) : contextBudget

  const usedTokens = systemTokens + estimateTokens(JSON.stringify(messages))
  const remainingBudget = effectiveBudget - usedTokens
  console.log('[contextAssembler] Effective budget:', effectiveBudget, '| remaining for messages:', remainingBudget)

  const recentMessages: { role: 'user' | 'assistant'; content: string }[] = []
  let tokenCount = 0

  // Walk backwards through messages to get most recent that fit
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const msg = session.messages[i]
    if (msg.streaming) continue
    const msgTokens = estimateTokens(msg.content) + 10 // overhead
    if (tokenCount + msgTokens > remainingBudget && recentMessages.length > 0) {
      console.log('[contextAssembler] Hit token limit at message index', i, '- truncating older messages')
      break
    }
    recentMessages.unshift({ role: msg.role, content: msg.content })
    tokenCount += msgTokens
  }

  messages.push(...recentMessages)

  const totalTokens = systemTokens + tokenCount
  console.log('[contextAssembler] Messages included:', recentMessages.length, 'of', session.messages.length)
  console.log('[contextAssembler] ========== ASSEMBLED:', totalTokens, 'tokens ==========')

  return { system, messages }
}

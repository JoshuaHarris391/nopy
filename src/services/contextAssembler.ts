import { estimateTokens } from '../utils/tokenEstimator'
import type { ChatSession, ChatEntryContext } from '../types/chat'
import type { PsychologicalProfile } from '../types/profile'
import type { JournalEntry } from '../types/journal'

interface AssembledContext {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
}

const JOURNAL_INDEX_LIMIT = 30

export function assembleContext(
  session: ChatSession,
  profile: PsychologicalProfile | null,
  entries: JournalEntry[],
  systemPrompt: string,
  contextBudget: number = 30000,
  entryContext?: ChatEntryContext,
): AssembledContext {
  console.log('[contextAssembler] ========== ASSEMBLING CONTEXT ==========')
  console.log('[contextAssembler] Session ID:', session.id)
  console.log('[contextAssembler] Session messages count:', session.messages.length)
  console.log('[contextAssembler] Context budget:', contextBudget, 'tokens')

  // Build system prompt with profile
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  let system = systemPrompt + `\n\nToday's date: ${today}`
  console.log('[contextAssembler] Base system prompt length:', systemPrompt.length, 'chars')

  // Inject full psychological profile
  if (profile?.fullProfile) {
    system += `\n\n## Psychological Profile\n${profile.fullProfile}`
    console.log('[contextAssembler] ✓ Injected full psychological profile:', profile.fullProfile.length, 'chars')
  } else if (profile?.summary) {
    system += `\n\n## Current Psychological Profile\n${profile.summary}`
    console.log('[contextAssembler] ✓ Injected profile summary:', profile.summary.length, 'chars')
  } else {
    console.log('[contextAssembler] ✗ No profile available')
  }

  if (profile && profile.themes.length > 0) {
    const themesStr = profile.themes.map((t) => t.theme).join(', ')
    system += `\n\nRecurring themes: ${themesStr}`
    console.log('[contextAssembler] ✓ Injected themes:', profile.themes.length, 'themes')
  }

  // Inject entry index table (background reference — capped to most recent entries)
  const indexed = entries.filter((e) => e.indexed && e.summary)
  console.log('[contextAssembler] Total entries:', entries.length, '| Indexed with summaries:', indexed.length)

  if (indexed.length > 0) {
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
    system += `\n\n## Journal Entry Index (${sortedEntries.length} most recent)\n| Date | Title | Mood | Tags | Summary |\n|------|-------|------|------|---------|${table ? '\n' + table : ''}`
    console.log('[contextAssembler] ✓ Injected entry index table with', sortedEntries.length, 'of', indexed.length, 'entries (capped at', JOURNAL_INDEX_LIMIT, ')')
    console.log('[contextAssembler]   Date range:', sortedEntries[sortedEntries.length - 1]?.createdAt.slice(0, 10), 'to', sortedEntries[0]?.createdAt.slice(0, 10))
  }

  // Inject focused entry context last — highest attention position
  if (entryContext) {
    const dateStr = entryContext.date ? new Date(entryContext.date).toLocaleDateString() : 'undated'
    system += `\n\n## Current Session Focus\nThis journal entry is the focus of the entire session. Reference its specific content throughout the conversation when relevant. Do not ask the user to share it — you have the full text below.\n\n**${entryContext.title}** (${dateStr})\n\n${entryContext.content}`
    console.log('[contextAssembler] ✓ Injected entry context: date:', dateStr, '| content:', entryContext.content.length, 'chars')
  }

  const systemTokens = estimateTokens(system)
  console.log('[contextAssembler] Final system prompt:', system.length, 'chars |', systemTokens, 'tokens (estimated)')

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
    console.log('[contextAssembler] ✓ Injected session summary (session has', session.messages.length, 'messages, summary:', session.summary.length, 'chars)')
  }

  // Take recent messages that fit within budget
  const usedTokens = systemTokens + estimateTokens(JSON.stringify(messages))
  const remainingBudget = contextBudget - usedTokens
  console.log('[contextAssembler] Token budget breakdown:')
  console.log('[contextAssembler]   System prompt:', systemTokens, 'tokens')
  console.log('[contextAssembler]   Summary injection:', estimateTokens(JSON.stringify(messages)), 'tokens')
  console.log('[contextAssembler]   Remaining for messages:', remainingBudget, 'tokens')

  const recentMessages: { role: 'user' | 'assistant'; content: string }[] = []
  let tokenCount = 0
  let skippedStreaming = 0

  // Walk backwards through messages to get most recent that fit
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const msg = session.messages[i]
    if (msg.streaming) {
      skippedStreaming++
      continue
    }
    const msgTokens = estimateTokens(msg.content) + 10 // overhead
    if (tokenCount + msgTokens > remainingBudget && recentMessages.length > 0) {
      console.log('[contextAssembler] Hit token limit at message index', i, '- truncating older messages')
      break
    }
    recentMessages.unshift({ role: msg.role, content: msg.content })
    tokenCount += msgTokens
  }

  messages.push(...recentMessages)

  console.log('[contextAssembler] Messages included:', recentMessages.length, 'of', session.messages.length)
  if (skippedStreaming > 0) {
    console.log('[contextAssembler]   Skipped streaming messages:', skippedStreaming)
  }
  console.log('[contextAssembler]   Message tokens used:', tokenCount)

  const totalTokens = systemTokens + tokenCount
  console.log('[contextAssembler] ========== CONTEXT ASSEMBLED ==========')
  console.log('[contextAssembler] Total estimated tokens:', totalTokens, '/', contextBudget, `(${Math.round((totalTokens / contextBudget) * 100)}% of budget)`)

  return { system, messages }
}

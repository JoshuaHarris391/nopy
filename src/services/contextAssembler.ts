import { estimateTokens } from '../utils/tokenEstimator'
import type { ChatSession } from '../types/chat'
import type { PsychologicalProfile } from '../types/profile'
import type { JournalEntry } from '../types/journal'

interface AssembledContext {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
}

interface EntryContext {
  title: string
  content: string
  date?: string
}

export function assembleContext(
  session: ChatSession,
  profile: PsychologicalProfile | null,
  entries: JournalEntry[],
  systemPrompt: string,
  maxTokens: number = 30000,
  entryContext?: EntryContext,
): AssembledContext {
  // Build system prompt with profile
  let system = systemPrompt

  // Inject full psychological profile
  if (profile?.fullProfile) {
    system += `\n\n## Psychological Profile\n${profile.fullProfile}`
  } else if (profile?.summary) {
    system += `\n\n## Current Psychological Profile\n${profile.summary}`
  }

  if (profile && profile.themes.length > 0) {
    system += `\n\nRecurring themes: ${profile.themes.map((t) => t.theme).join(', ')}`
  }

  // Inject focused entry context (from "Start Session" in entry editor)
  if (entryContext) {
    const dateStr = entryContext.date ? new Date(entryContext.date).toLocaleDateString() : 'undated'
    system += `\n\n## Current Session Focus\nThe user wants to discuss this specific journal entry:\n\n**${entryContext.title}** (${dateStr})\n\n${entryContext.content}\n\nBegin the session by responding warmly to their prompt to talk about this entry. You already have the full content above — do not ask them to share it again.`
  }

  // Inject entry index table
  const indexed = entries.filter((e) => e.indexed && e.summary)
  if (indexed.length > 0) {
    const table = indexed
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((e) => {
        const date = e.createdAt.slice(0, 10)
        const mood = e.mood ? `${e.mood.value}/10` : '-'
        const tags = e.tags.join(', ') || '-'
        return `| ${date} | ${e.title} | ${mood} | ${tags} | ${e.summary} |`
      })
      .join('\n')
    system += `\n\n## Journal Entry Index\n| Date | Title | Mood | Tags | Summary |\n|------|-------|------|------|---------|${table ? '\n' + table : ''}`
  }

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
  }

  // Take recent messages that fit within budget
  const usedTokens = estimateTokens(system) + estimateTokens(JSON.stringify(messages))
  const remainingBudget = maxTokens - usedTokens

  const recentMessages: { role: 'user' | 'assistant'; content: string }[] = []
  let tokenCount = 0

  // Walk backwards through messages to get most recent that fit
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const msg = session.messages[i]
    if (msg.streaming) continue
    const msgTokens = estimateTokens(msg.content) + 10 // overhead
    if (tokenCount + msgTokens > remainingBudget && recentMessages.length > 0) break
    recentMessages.unshift({ role: msg.role, content: msg.content })
    tokenCount += msgTokens
  }

  messages.push(...recentMessages)
  return { system, messages }
}

import { estimateTokens } from '../utils/tokenEstimator'
import type { ChatSession } from '../types/chat'
import type { PsychologicalProfile } from '../types/profile'

interface AssembledContext {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
}

export function assembleContext(
  session: ChatSession,
  profile: PsychologicalProfile | null,
  systemPrompt: string,
  maxTokens: number = 10000,
): AssembledContext {
  // Build system prompt with profile
  let system = systemPrompt
  if (profile) {
    system += `\n\n## Current Psychological Profile\n${profile.summary}`
    if (profile.themes.length > 0) {
      system += `\n\nRecurring themes: ${profile.themes.map((t) => t.theme).join(', ')}`
    }
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
    if (tokenCount + msgTokens > remainingBudget) break
    recentMessages.unshift({ role: msg.role, content: msg.content })
    tokenCount += msgTokens
  }

  messages.push(...recentMessages)
  return { system, messages }
}

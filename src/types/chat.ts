export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  streaming?: boolean
}

export interface ChatEntryContext {
  title: string
  content: string
  date?: string
}

/**
 * Billed token usage accumulated across every turn of a session. Sourced from
 * the provider's returned `usage` (currently Anthropic only) — NOT from
 * client-side estimation — so it reflects what the user is actually charged.
 * `input`/`output` are the standard-rate tokens; `cacheRead` (~0.1x) and
 * `cacheWrite` (~1.25x) are the prompt-caching tokens, tracked separately so a
 * cost estimate stays accurate and the caching reduction is visible.
 */
export interface ChatUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  summary: string | null
  createdAt: string
  updatedAt: string
  status: 'active' | 'archived'
  entryContext?: ChatEntryContext | null
  entryContextRef?: string | null
  /**
   * Cumulative billed token usage for the conversation. Absent on sessions
   * created before this feature, and on sessions run against providers that
   * don't report usage (OpenAI/local) — callers treat absence as "unknown".
   */
  usage?: ChatUsage
}

export interface ChatSessionMeta {
  id: string
  title: string
  summary: string | null
  createdAt: string
  updatedAt: string
  status: 'active' | 'archived'
  messageCount: number
  lastMessagePreview: string
}

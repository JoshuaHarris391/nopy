export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  streaming?: boolean
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  summary: string | null
  createdAt: string
  updatedAt: string
  status: 'active' | 'archived'
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

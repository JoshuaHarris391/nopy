import { useEffect, useRef, useCallback } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useChatStore } from '../../stores/chatStore'
import { useProfileStore } from '../../stores/profileStore'
import { useJournalStore } from '../../stores/journalStore'
import { streamChatResponse, sendMessage } from '../../services/anthropic'
import { assembleContext } from '../../services/contextAssembler'
import { PSYCHOLOGIST_SYSTEM_PROMPT } from '../../services/prompts/psychologist'
import { MainHeader } from '../ui/MainHeader'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ChatSessionList } from './ChatSessionList'
import { MessageCircle, Leaf } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '../../types/chat'

export function ChatView() {
  const { apiKey, preferredModel } = useSettingsStore()
  const {
    sessions, activeSession, activeSessionId, loaded,
    loadSessionList, createSession, loadSession,
    addMessage, updateStreamingMessage, finaliseStreamingMessage,
    updateSessionTitle,
  } = useChatStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const streamingRef = useRef(false)

  useEffect(() => {
    if (!loaded) loadSessionList()
  }, [loaded, loadSessionList])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeSession?.messages])

  const handleNewSession = useCallback(async () => {
    await createSession()
  }, [createSession])

  const handleSelectSession = useCallback(async (id: string) => {
    await loadSession(id)
  }, [loadSession])

  const handleSend = useCallback(async (content: string) => {
    if (!apiKey || streamingRef.current) return

    // Create session if none active
    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createSession()
    }

    streamingRef.current = true

    // Add user message
    const userMsg: ChatMessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    await addMessage(userMsg)

    // Add streaming placeholder
    const assistantMsg: ChatMessageType = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      streaming: true,
    }
    await addMessage(assistantMsg)

    // Assemble context and stream
    const session = useChatStore.getState().activeSession
    if (!session) return

    const profile = useProfileStore.getState().profile
    const entries = useJournalStore.getState().entries
    const { system, messages } = assembleContext(session, profile, entries, PSYCHOLOGIST_SYSTEM_PROMPT)

    await streamChatResponse(
      apiKey,
      preferredModel,
      system,
      messages.filter((m) => !!m.content), // remove empty streaming placeholder from context
      (fullText) => updateStreamingMessage(fullText),
      async () => {
        await finaliseStreamingMessage()
        streamingRef.current = false

        // Generate title after first exchange
        const currentSession = useChatStore.getState().activeSession
        if (currentSession && currentSession.title === 'New conversation' && currentSession.messages.length >= 2) {
          try {
            const titleMessages = currentSession.messages.slice(0, 4).map((m) => ({
              role: m.role,
              content: m.content,
            }))
            const title = await sendMessage(
              apiKey,
              'claude-haiku-4-5-20251001',
              'Generate a short, 3-6 word title for this therapy journaling conversation. Return only the title, nothing else.',
              titleMessages,
              30,
            )
            if (title.trim()) {
              await updateSessionTitle(currentSession.id, title.trim())
            }
          } catch {
            // Title generation is non-critical
          }
        }
      },
      (error) => {
        console.error('Chat error:', error)
        streamingRef.current = false
        // Update the streaming message with error
        updateStreamingMessage(`I'm sorry, I encountered an error: ${error.message}`)
        finaliseStreamingMessage()
      },
    )
  }, [apiKey, preferredModel, activeSessionId, createSession, addMessage, updateStreamingMessage, finaliseStreamingMessage, updateSessionTitle])

  const isStreaming = activeSession?.messages.some((m) => m.streaming) ?? false

  return (
    <>
      <MainHeader title="Chat">
        {activeSession && (
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--sage)' }}>
            {activeSession.messages.length} messages
          </span>
        )}
      </MainHeader>
      <div className="flex flex-1 overflow-hidden">
        {/* Session list - desktop only */}
        <div className="hidden lg:block">
          <ChatSessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={handleSelectSession}
            onCreate={handleNewSession}
          />
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ padding: '0 44px' }}>
          {!activeSession ? (
            // Empty state
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div
                className="flex items-center justify-center"
                style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'linear-gradient(135deg, var(--bark), var(--amber))',
                  marginBottom: 16,
                }}
              >
                <Leaf size={24} color="white" strokeWidth={1.8} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--ink)', marginBottom: 8 }}>
                Start a conversation
              </h3>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--sage)', maxWidth: 320, marginBottom: 20 }}>
                {apiKey
                  ? "Share what's on your mind. I'm here to listen and help you explore your thoughts."
                  : 'Add your Anthropic API key in Settings to begin chatting.'}
              </p>
              {apiKey && (
                <button
                  onClick={handleNewSession}
                  className="cursor-pointer flex items-center gap-2"
                  style={{
                    fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
                    padding: '7px 16px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--forest)', color: 'white', border: 'none',
                    boxShadow: '0 2px 6px rgba(91, 127, 94, 0.22)',
                  }}
                >
                  <MessageCircle size={14} strokeWidth={2} />
                  New conversation
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div
                className="flex-1 flex flex-col gap-5 overflow-y-auto"
                style={{ maxWidth: 640, margin: '0 auto', width: '100%', padding: '24px 0 16px' }}
              >
                {activeSession.messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{ maxWidth: 640, margin: '0 auto', width: '100%', paddingBottom: 16 }}>
                <ChatInput onSend={handleSend} disabled={!apiKey || isStreaming} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

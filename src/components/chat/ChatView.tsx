import { useEffect, useRef, useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { MessageCircle, Leaf, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '../../types/chat'

export function ChatView() {
  const { apiKey, preferredModel, maxOutputTokens, contextBudget, sessionPanelCollapsed, toggleSessionPanel, setSessionPanelCollapsed } = useSettingsStore()
  const {
    sessions, activeSession, activeSessionId, loaded,
    loadSessionList, createSession, loadSession,
    addMessage, updateStreamingMessage, finaliseStreamingMessage,
    updateSessionTitle, deleteSession,
  } = useChatStore()

  const location = useLocation()
  const navigate = useNavigate()
  const [generatingTitleId, setGeneratingTitleId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const rafRef = useRef<number | null>(null)
  const streamingRef = useRef(false)
  const entryContextHandled = useRef(false)

  useEffect(() => {
    if (!loaded) loadSessionList()
  }, [loaded, loadSessionList])

  // Auto-collapse session panel below 1024px
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    if (mq.matches) setSessionPanelCollapsed(true)
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSessionPanelCollapsed(true)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [setSessionPanelCollapsed])

  // Smooth momentum scroll toward bottom using lerp
  const smoothScrollToBottom = useCallback(() => {
    if (rafRef.current !== null) return // already running
    const el = scrollContainerRef.current
    if (!el) return

    const tick = () => {
      const target = el.scrollHeight - el.clientHeight
      const current = el.scrollTop
      const delta = target - current

      if (Math.abs(delta) < 1) {
        el.scrollTop = target
        rafRef.current = null
        return
      }

      // Lerp with dampening — 12% per frame feels smooth but responsive
      el.scrollTop += delta * 0.12
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // Trigger smooth scroll on message updates if near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      smoothScrollToBottom()
    }
  }, [activeSession?.messages, smoothScrollToBottom])

  // Cancel any in-flight scroll animation on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distFromBottom < 80
    // If user scrolled up manually, cancel the momentum animation
    if (distFromBottom > 80 && rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

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
    const { system, messages } = assembleContext(session, profile, entries, PSYCHOLOGIST_SYSTEM_PROMPT, contextBudget, session.entryContext ?? undefined)
    const filteredMessages = messages.filter((m) => !!m.content)

    if (filteredMessages.length === 0) {
      streamingRef.current = false
      return
    }

    await streamChatResponse(
      apiKey,
      preferredModel,
      system,
      filteredMessages,
      maxOutputTokens,
      (fullText) => updateStreamingMessage(fullText),
      async () => {
        await finaliseStreamingMessage()
        streamingRef.current = false

        // Generate title after first exchange
        const currentSession = useChatStore.getState().activeSession
        if (currentSession && currentSession.title === 'New conversation' && currentSession.messages.length >= 2) {
          try {
            setGeneratingTitleId(currentSession.id)
            const snippet = currentSession.messages.slice(0, 4).map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')
            const title = await sendMessage(
              apiKey,
              'claude-haiku-4-5-20251001',
              'You generate short titles for conversations. Respond with ONLY the title, nothing else.',
              [{ role: 'user', content: `Generate a short title for this conversation. Format: "YYYY-MM-DD — topic" where the date is ${new Date().toISOString().slice(0, 10)} and topic is 2-4 words.\n\nConversation:\n${snippet}` }],
              50,
            )
            if (title.trim()) {
              await updateSessionTitle(currentSession.id, title.trim())
            }
          } catch (e) {
            console.error('Title generation failed:', e)
          } finally {
            setGeneratingTitleId(null)
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
  }, [apiKey, preferredModel, maxOutputTokens, contextBudget, activeSessionId, createSession, addMessage, updateStreamingMessage, finaliseStreamingMessage, updateSessionTitle])


  // Handle "Explore with nopy" entry context from router state
  useEffect(() => {
    const state = location.state as { entryTitle?: string; entryContent?: string; entryDate?: string } | null
    if (!state?.entryContent || !apiKey || !loaded || entryContextHandled.current) return
    entryContextHandled.current = true
    navigate('/chat', { replace: true, state: null })

    const entryTitle = state.entryTitle || 'Untitled'
    const visibleMessage = `Let's talk about "${entryTitle}"`
    const entryContext = { title: entryTitle, content: state.entryContent, date: state.entryDate }

    ;(async () => {
      await createSession(entryContext)
      // Let session state settle, then send
      setTimeout(() => handleSend(visibleMessage), 100)
    })()
  }, [location.state, apiKey, loaded, navigate, createSession, handleSend])

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
        {/* Session list - desktop only, collapsible */}
        <div
          className="hidden lg:flex h-full flex-shrink-0 relative"
          style={{
            width: sessionPanelCollapsed ? 0 : 300,
            overflow: 'hidden',
            transition: 'width 200ms ease',
          }}
        >
          <ChatSessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={handleSelectSession}
            onCreate={handleNewSession}
            onRename={(id, title) => updateSessionTitle(id, title)}
            onDelete={(id) => deleteSession(id)}
            generatingTitleId={generatingTitleId}
          />
        </div>

        {/* Session panel toggle - desktop only */}
        <button
          className="hidden lg:flex items-center justify-center flex-shrink-0 cursor-pointer"
          onClick={toggleSessionPanel}
          style={{
            width: 20,
            background: 'var(--warm-cream)',
            border: 'none',
            borderRight: '1px solid var(--stone)',
            color: 'var(--sage)',
            transition: 'color 150ms ease, background 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--forest)'
            e.currentTarget.style.background = 'var(--parchment)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--sage)'
            e.currentTarget.style.background = 'var(--warm-cream)'
          }}
          title={sessionPanelCollapsed ? 'Show sessions' : 'Hide sessions'}
        >
          {sessionPanelCollapsed
            ? <PanelLeftOpen size={12} strokeWidth={1.5} />
            : <PanelLeftClose size={12} strokeWidth={1.5} />
          }
        </button>

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
            style={{ padding: '36px 44px 0 44px' }}
          >
            <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto' }}>
              {!activeSession ? (
                // Empty state
                <div className="flex flex-col items-center justify-center text-center" style={{ paddingTop: 120 }}>
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
                  <div className="flex flex-col" style={{ gap: 32 }}>
                    {activeSession.messages.map((msg) => (
                      <ChatMessage key={msg.id} message={msg} />
                    ))}
                  </div>
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </div>

          {/* Input pinned below scroll area */}
          {activeSession && (
            <div style={{ padding: '0 44px' }}>
              <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto' }}>
                <ChatInput onSend={handleSend} disabled={!apiKey || isStreaming} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

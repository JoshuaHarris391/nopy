import { useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useSettingsStore, selectLlmConfig } from '../../stores/settingsStore'
import { useChatStore } from '../../stores/chatStore'
import { useProfileStore } from '../../stores/profileStore'
import { useContextStore } from '../../stores/contextStore'
import { useModelCatalogStore } from '../../stores/modelCatalogStore'
import { isLlmConfigured } from '../../services/llm'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { MainHeader } from '../ui/MainHeader'
import { formatUsage, usageBreakdown } from '../../utils/formatUsage'
import { ChatInput } from './ChatInput'
import { ChatSessionPanel } from './ChatSessionPanel'
import { ChatMessageList } from './ChatMessageList'
import { useChatScroll } from './useChatScroll'
import { useChatSend } from './useChatSend'

export function ChatView() {
  const llmConfig = useSettingsStore(useShallow(selectLlmConfig))
  const ready = isLlmConfigured(llmConfig)
  const maxOutputTokens = useSettingsStore((s) => s.maxOutputTokens)
  const contextBudget = useSettingsStore((s) => s.contextBudget)
  const therapyType = useSettingsStore((s) => s.therapyType)
  const sessionPanelCollapsed = useSettingsStore((s) => s.sessionPanelCollapsed)
  const toggleSessionPanel = useSettingsStore((s) => s.toggleSessionPanel)
  const setSessionPanelCollapsed = useSettingsStore((s) => s.setSessionPanelCollapsed)
  const showTokenUsage = useSettingsStore((s) => s.showTokenUsage)
  const sessions = useChatStore((s) => s.sessions)
  const activeSession = useChatStore((s) => s.activeSession)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const loaded = useChatStore((s) => s.loaded)
  const loadSessionList = useChatStore((s) => s.loadSessionList)
  const createSession = useChatStore((s) => s.createSession)
  const loadSession = useChatStore((s) => s.loadSession)
  const updateSessionTitle = useChatStore((s) => s.updateSessionTitle)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const profileLoaded = useProfileStore((s) => s.loaded)
  const loadProfile = useProfileStore((s) => s.loadProfile)
  const contextLoaded = useContextStore((s) => s.loaded)
  const loadContext = useContextStore((s) => s.loadContext)

  const location = useLocation()
  const navigate = useNavigate()
  const entryContextHandled = useRef(false)

  useEffect(() => {
    if (!loaded) loadSessionList()
  }, [loaded, loadSessionList])

  // Load the psychological profile from IDB on mount so the first send has
  // it available. Without this, a user opening the app and going straight
  // to /chat sends with profile=null because nothing else hydrates it
  // (loadProfile is otherwise only called from ProfileView).
  useEffect(() => {
    if (!profileLoaded) loadProfile()
  }, [profileLoaded, loadProfile])

  // Load the Context Workspace selection so the first send injects the right
  // material. Without it, the send-time hydration below still covers it.
  useEffect(() => {
    if (!contextLoaded) loadContext()
  }, [contextLoaded, loadContext])

  // Warm the LiteLLM context-window catalog so the first send sizes the budget
  // to the model's real window.
  useEffect(() => { useModelCatalogStore.getState().ensure() }, [])

  // Auto-collapse session panel below 1024px. One-way: never auto-expands.
  const isNarrow = useMediaQuery('(max-width: 1023px)')
  useEffect(() => {
    if (isNarrow) setSessionPanelCollapsed(true)
  }, [isNarrow, setSessionPanelCollapsed])

  const { scrollContainerRef, messagesEndRef, handleScroll, snapToBottom } = useChatScroll(activeSession?.messages)

  const { handleSend, generatingTitleId } = useChatSend({
    llmConfig,
    ready,
    maxOutputTokens,
    contextBudget,
    therapyType,
    snapToBottom,
  })

  const handleNewSession = useCallback(async () => {
    await createSession()
  }, [createSession])

  const handleSelectSession = useCallback(async (id: string) => {
    await loadSession(id)
  }, [loadSession])

  // Handle "Explore with nopy" entry context from router state
  useEffect(() => {
    const state = location.state as { entryTitle?: string; entryContent?: string; entryDate?: string } | null
    if (!state?.entryContent || !ready || !loaded || entryContextHandled.current) return
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
  }, [location.state, ready, loaded, navigate, createSession, handleSend])

  const isStreaming = activeSession?.messages.some((m) => m.streaming) ?? false

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <ChatSessionPanel
        collapsed={sessionPanelCollapsed}
        onToggle={toggleSessionPanel}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={handleSelectSession}
        onCreate={handleNewSession}
        onRename={(id, title) => updateSessionTitle(id, title)}
        onDelete={(id) => deleteSession(id)}
        generatingTitleId={generatingTitleId}
      />

      {/* Chat area with its own header */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <MainHeader title="Chat">
          {activeSession && (
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)' }}>
              {activeSession.messages.length} messages
            </span>
          )}
          {showTokenUsage && activeSession?.usage && (
            <span
              title={`Estimated tokens billed for this conversation, cache-adjusted (reads ~0.1×, writes ~1.25×). Raw: ${usageBreakdown(activeSession.usage)}`}
              style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)' }}
            >
              {formatUsage(activeSession.usage)}
            </span>
          )}
        </MainHeader>

        <ChatMessageList
          session={activeSession}
          ready={ready}
          provider={llmConfig.provider}
          onNewSession={handleNewSession}
          scrollContainerRef={scrollContainerRef}
          onScroll={handleScroll}
          messagesEndRef={messagesEndRef}
        />

        {/* Input pinned below scroll area */}
        {activeSession && (
          <div style={{ padding: '0 44px' }}>
            <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto' }}>
              <ChatInput onSend={handleSend} disabled={!ready || isStreaming} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

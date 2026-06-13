import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useChatStore } from '../../stores/chatStore'
import { useProfileStore } from '../../stores/profileStore'
import { useJournalStore } from '../../stores/journalStore'
import { useContextStore } from '../../stores/contextStore'
import { useModelCatalogStore } from '../../stores/modelCatalogStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { streamChatResponse, sendMessage, LlmError, LLM_ERROR_MESSAGES, type LlmConfig } from '../../services/llm'
import { TOKEN_LIMITS, getModelContextWindow } from '../../services/models'
import { assembleContext } from '../../services/contextAssembler'
import { resolveContextItems, toInjectedItems } from '../../services/contextResolver'
import { useLocalModels } from '../../hooks/useLocalModels'
import { hydrateEntryContext } from '../../services/chatPersistence'
import { getTherapyPrompt, type TherapyType } from '../../services/prompts/therapists'
import type { ChatMessage as ChatMessageType } from '../../types/chat'

/**
 * The chat send pipeline, extracted from ChatView: session bootstrap,
 * context assembly (profile + journal index + Context Workspace), streaming
 * with inline + toast error surfacing, and post-exchange title generation.
 * ChatView keeps only layout and navigation concerns.
 */
export function useChatSend({
  llmConfig,
  ready,
  maxOutputTokens,
  contextBudget,
  therapyType,
  snapToBottom,
}: {
  llmConfig: LlmConfig
  ready: boolean
  maxOutputTokens: number
  contextBudget: number
  therapyType: TherapyType
  /** Called after the user/placeholder messages are appended so the view can scroll. */
  snapToBottom: () => void
}) {
  const localBaseUrl = useSettingsStore((s) => s.localBaseUrl)
  // Probe LM Studio only in local mode so we can size the budget to the loaded
  // window; in hosted modes we pass no models and fall back to the static map.
  const { models: localModels } = useLocalModels(llmConfig.provider === 'local' ? localBaseUrl : '')
  const localModelsRef = useRef(localModels)
  useEffect(() => { localModelsRef.current = localModels }, [localModels])

  const createSession = useChatStore((s) => s.createSession)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateStreamingMessage = useChatStore((s) => s.updateStreamingMessage)
  const finalizeStreamingMessage = useChatStore((s) => s.finalizeStreamingMessage)
  const updateSessionTitle = useChatStore((s) => s.updateSessionTitle)

  const [generatingTitleId, setGeneratingTitleId] = useState<string | null>(null)
  const streamingRef = useRef(false)

  const handleSend = useCallback(async (content: string) => {
    if (!ready || streamingRef.current) return

    // Read activeSessionId from the store at call time, not from the
    // useCallback closure. The entry-context useEffect awaits
    // createSession(entryContext) and then setTimeout(() => handleSend(...)).
    // Using the closure value here would see the stale activeSessionId from
    // the render that captured handleSend (typically null on first navigation
    // into /chat), causing this branch to create a SECOND, orphan session
    // without entryContext — losing the journal entry from the LLM context.
    let sessionId = useChatStore.getState().activeSessionId
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

    // Snap to bottom once both messages are in the DOM
    snapToBottom()

    // Assemble context and stream
    let session = useChatStore.getState().activeSession
    if (!session) return

    // Lazy hydration: if restored from disk with entryContextRef but no entryContext, read the file
    if (session.entryContextRef && !session.entryContext) {
      const journalPath = useSettingsStore.getState().journalPath
      if (journalPath) {
        const ctx = await hydrateEntryContext(session.entryContextRef, journalPath)
        if (ctx) {
          await useChatStore.getState().updateEntryContext(session.id, ctx)
          session = useChatStore.getState().activeSession!
        }
      }
    }

    // Belt-and-suspenders for the mount-time loadProfile() effect: if the
    // user sends before that effect resolves (or it never ran because this
    // is the first time anyone reads the profile) hydrate it now so the
    // first message never goes out without personalisation.
    if (!useProfileStore.getState().loaded) {
      await useProfileStore.getState().loadProfile()
    }
    const profile = useProfileStore.getState().profile
    const entries = useJournalStore.getState().entries

    // Resolve the Context Workspace selection (notes + profile/index, in the
    // user's chosen order). If the store hasn't hydrated yet, do it now so we
    // never fall back to the un-curated default mid-session.
    if (!useContextStore.getState().loaded) {
      await useContextStore.getState().loadContext()
    }
    const ctx = useContextStore.getState()
    const journalIndexLimit = useSettingsStore.getState().journalIndexLimit
    const resolved = resolveContextItems(ctx.notes, ctx.injection, profile, entries, journalIndexLimit)
    const injectedItems = toInjectedItems(resolved)
    const hostedId = llmConfig.provider === 'openai' ? llmConfig.openaiModel : llmConfig.anthropicMainModel
    const catalogWindow = llmConfig.provider === 'local' ? undefined : useModelCatalogStore.getState().contextWindowFor(hostedId)
    const { tokens: window } = getModelContextWindow(
      llmConfig,
      localModelsRef.current,
      useSettingsStore.getState().modelContextWindowOverride,
      catalogWindow,
    )

    const { system, messages } = assembleContext(
      session,
      profile,
      entries,
      getTherapyPrompt(therapyType),
      contextBudget,
      session.entryContext ?? undefined,
      { injectedItems, window, maxOutputTokens, journalIndexLimit },
    )
    const filteredMessages = messages.filter((m) => !!m.content)

    if (filteredMessages.length === 0) {
      streamingRef.current = false
      return
    }

    // Translate dispatcher errors into the curated user-facing copy from
    // LLM_ERROR_MESSAGES. For non-LlmError throws (rare — usually a code
    // bug), fall back to the raw message.
    const renderErrorMessage = (error: Error): string => {
      if (error instanceof LlmError) {
        return error.message || LLM_ERROR_MESSAGES[error.code]
      }
      return `I'm sorry, I encountered an error: ${error.message}`
    }

    try {
      await streamChatResponse(
        llmConfig,
        'main',
        system,
        filteredMessages,
        maxOutputTokens,
        (fullText) => updateStreamingMessage(fullText),
        async (fullText) => {
          await finalizeStreamingMessage()
          streamingRef.current = false

          // Defensive guard: if a provider misbehaves and fires onComplete
          // with empty text (the SSE-error-event bug we hit in production
          // before the localServer parser was fixed), don't generate a
          // title for an empty conversation. The error path runs onError
          // separately — here we just bail.
          if (!fullText.trim()) return

          // Generate title after first exchange
          const currentSession = useChatStore.getState().activeSession
          if (currentSession && currentSession.title === 'New conversation' && currentSession.messages.length >= 2) {
            try {
              setGeneratingTitleId(currentSession.id)
              const snippet = currentSession.messages.slice(0, 4).map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')
              const title = await sendMessage(
                llmConfig,
                'lightweight',
                'You generate short titles for conversations. Respond with ONLY the title, nothing else.',
                [{ role: 'user', content: `Generate a short title for this conversation. Format: "YYYY-MM-DD — topic" where the date is ${new Date().toISOString().slice(0, 10)} and topic is 2-4 words.\n\nConversation:\n${snippet}` }],
                TOKEN_LIMITS.titleGeneration,
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
          console.error('Chat stream error:', error)
          streamingRef.current = false
          const message = renderErrorMessage(error)
          // Inline error in the assistant placeholder so the conversation
          // history shows what happened in context.
          updateStreamingMessage(message)
          finalizeStreamingMessage()
          // Plus a bottom-right notification so users can't miss an error
          // that happens off-screen (e.g. they scrolled up). Title is
          // intentionally generic — the actionable copy lives in `message`.
          useNotificationStore.getState().push({
            kind: 'error',
            title: 'Chat error',
            message,
          })
        },
      )
    } catch (error) {
      console.error('Chat setup error:', error)
      streamingRef.current = false
      const msg = error instanceof Error ? renderErrorMessage(error) : `I'm sorry, I couldn't connect: ${String(error)}`
      updateStreamingMessage(msg)
      await finalizeStreamingMessage()
    }
  }, [llmConfig, ready, maxOutputTokens, contextBudget, therapyType, snapToBottom, createSession, addMessage, updateStreamingMessage, finalizeStreamingMessage, updateSessionTitle])

  return { handleSend, generatingTitleId }
}

import { hasFileSystem, parseMarkdown, extractDateFromFilename } from './fs'
import type { ChatSession, ChatEntryContext } from '../types/chat'

interface ChatFile {
  version: number
  updatedAt: string
  sessions: unknown[]
}

// --- Save ---

function stripForDisk(session: ChatSession): Record<string, unknown> {
  const { entryContext, ...rest } = session
  return {
    ...rest,
    entryContextRef: session.entryContextRef ?? (entryContext ? undefined : null),
    messages: session.messages.map(({ streaming, ...msg }) => msg),
  }
}

export async function saveChatToDisk(sessions: ChatSession[], journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return

  const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs')

  if (!(await exists(journalPath))) {
    await mkdir(journalPath, { recursive: true })
  }

  const data: ChatFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sessions: sessions.map(stripForDisk),
  }

  await writeTextFile(`${journalPath}/chat.json`, JSON.stringify(data, null, 2))
  console.log('[chatPersistence] Saved', sessions.length, 'sessions to disk')
}

// --- Load ---

export async function loadChatFromDisk(journalPath: string): Promise<ChatSession[]> {
  if (!hasFileSystem() || !journalPath) return []

  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')
  const filePath = `${journalPath}/chat.json`

  if (!(await exists(filePath))) return []

  try {
    const text = await readTextFile(filePath)
    const data = JSON.parse(text) as ChatFile
    if (!data.sessions || !Array.isArray(data.sessions)) return []
    console.log('[chatPersistence] Loaded', data.sessions.length, 'sessions from disk (version', data.version, ')')
    return data.sessions as ChatSession[]
  } catch (e) {
    console.warn('[chatPersistence] Failed to parse chat.json:', e)
    return []
  }
}

// --- Lazy hydration ---

export async function hydrateEntryContext(
  entryContextRef: string,
  journalPath: string,
): Promise<ChatEntryContext | null> {
  if (!hasFileSystem() || !journalPath || !entryContextRef) return null

  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')
  const filePath = `${journalPath}/${entryContextRef}`

  if (!(await exists(filePath))) {
    console.warn('[chatPersistence] Entry context file not found:', filePath)
    return null
  }

  try {
    const text = await readTextFile(filePath)
    const { frontmatter, content } = parseMarkdown(text)
    const title = (frontmatter.title as string) || entryContextRef.replace('.md', '')
    const date = (frontmatter.createdAt as string) || extractDateFromFilename(entryContextRef) || undefined
    console.log('[chatPersistence] Hydrated entry context from', entryContextRef)
    return { title, content, date }
  } catch (e) {
    console.warn('[chatPersistence] Failed to read entry context:', e)
    return null
  }
}

// --- Debounced writer ---

let pendingTimer: ReturnType<typeof setTimeout> | null = null
let pendingSessions: ChatSession[] | null = null
let pendingPath: string | null = null

export function scheduleChatSave(sessions: ChatSession[], journalPath: string): void {
  pendingSessions = sessions
  pendingPath = journalPath
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(async () => {
    pendingTimer = null
    if (pendingSessions && pendingPath) {
      await saveChatToDisk(pendingSessions, pendingPath)
      pendingSessions = null
      pendingPath = null
    }
  }, 2000)
}

export async function flushChatSave(): Promise<void> {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  if (pendingSessions && pendingPath) {
    await saveChatToDisk(pendingSessions, pendingPath)
    pendingSessions = null
    pendingPath = null
  }
}

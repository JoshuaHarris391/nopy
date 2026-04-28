import { hasFileSystem, parseMarkdown, extractDateFromFilename } from './fs'
import type { ChatSession, ChatEntryContext } from '../types/chat'

// --- Save ---

function stripForDisk(session: ChatSession): Record<string, unknown> {
  const { entryContext, ...rest } = session
  return {
    ...rest,
    entryContextRef: session.entryContextRef ?? (entryContext ? undefined : null),
    messages: session.messages.map((msg) => { const { streaming, ...rest } = msg; void streaming; return rest }),
  }
}

export async function saveChatToDisk(sessions: ChatSession[], journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return

  const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs')

  if (!(await exists(journalPath))) {
    await mkdir(journalPath, { recursive: true })
  }

  const body = sessions.map((s) => JSON.stringify(stripForDisk(s))).join('\n')
  const text = sessions.length > 0 ? body + '\n' : ''

  await writeTextFile(`${journalPath}/chat.ndjson`, text)
  console.log('[chatPersistence] Saved', sessions.length, 'sessions to disk (ndjson)')
}

// --- Load ---

async function migrateLegacyChatJson(journalPath: string): Promise<void> {
  const { readTextFile, writeTextFile, exists, remove } = await import('@tauri-apps/plugin-fs')
  const ndjsonPath = `${journalPath}/chat.ndjson`
  const legacyPath = `${journalPath}/chat.json`

  const [hasNdjson, hasLegacy] = await Promise.all([exists(ndjsonPath), exists(legacyPath)])

  if (!hasLegacy) return
  if (hasNdjson) {
    console.warn(
      '[chatPersistence] Both chat.json and chat.ndjson exist; preferring chat.ndjson and leaving chat.json in place. Delete chat.json manually if intended.',
    )
    return
  }

  try {
    const text = await readTextFile(legacyPath)
    const data = JSON.parse(text) as { sessions?: unknown[] }
    const sessions = Array.isArray(data?.sessions) ? data.sessions : []
    const body = sessions.map((s) => JSON.stringify(s)).join('\n')
    await writeTextFile(ndjsonPath, sessions.length > 0 ? body + '\n' : '')
    await remove(legacyPath)
    console.log(
      '[chatPersistence] Migrated',
      sessions.length,
      'sessions from chat.json to chat.ndjson',
    )
  } catch (e) {
    console.warn('[chatPersistence] Failed to migrate legacy chat.json:', e)
  }
}

export async function loadChatFromDisk(journalPath: string): Promise<ChatSession[]> {
  if (!hasFileSystem() || !journalPath) return []

  await migrateLegacyChatJson(journalPath)

  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')
  const filePath = `${journalPath}/chat.ndjson`

  if (!(await exists(filePath))) return []

  try {
    const text = await readTextFile(filePath)
    const lines = text.split('\n')
    const sessions: ChatSession[] = []
    let skipped = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      try {
        sessions.push(JSON.parse(line) as ChatSession)
      } catch (e) {
        skipped++
        console.warn('[chatPersistence] Skipping malformed line', i + 1, ':', e)
      }
    }
    if (skipped > 0) {
      console.warn('[chatPersistence] Skipped', skipped, 'malformed line(s) while loading chat.ndjson')
    }
    console.log('[chatPersistence] Loaded', sessions.length, 'sessions from disk (ndjson)')
    return sessions
  } catch (e) {
    console.warn('[chatPersistence] Failed to read chat.ndjson:', e)
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

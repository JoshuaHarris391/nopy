import type { JournalEntry } from '../types/journal'
import type { PsychologicalProfile } from '../types/profile'

export function hasFileSystem(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function slugify(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || id
}

function entryToMarkdown(entry: JournalEntry): string {
  const frontmatter: Record<string, unknown> = {
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    tags: entry.tags,
    indexed: entry.indexed,
  }
  if (entry.mood) {
    frontmatter.mood = entry.mood
  }
  if (entry.summary) {
    frontmatter.summary = entry.summary
  }

  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')

  return `---\n${yaml}\n---\n\n${entry.content}`
}

function parseMarkdown(text: string): { frontmatter: Record<string, unknown>; content: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, content: text }

  const frontmatter: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(': ')
    if (idx === -1) continue
    const key = line.slice(0, idx)
    const value = line.slice(idx + 2)
    try {
      frontmatter[key] = JSON.parse(value)
    } catch {
      frontmatter[key] = value
    }
  }
  return { frontmatter, content: match[2] }
}

export async function saveEntryToDisk(entry: JournalEntry, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) {
    console.log('[fs] saveEntryToDisk skipped:', { hasFs: hasFileSystem(), journalPath })
    return
  }

  try {
    const { mkdir, writeTextFile, exists, readTextFile, remove } = await import('@tauri-apps/plugin-fs')
    const journalDir = `${journalPath}/journal`

    console.log('[fs] Saving entry to disk:', { id: entry.id, title: entry.title, dir: journalDir })

    if (!(await exists(journalDir))) {
      console.log('[fs] Creating journal directory:', journalDir)
      await mkdir(journalDir, { recursive: true })
    }

    const filename = `${slugify(entry.title, entry.id)}.md`
    const filePath = `${journalDir}/${filename}`
    console.log('[fs] Writing file:', filePath)
    await writeTextFile(filePath, entryToMarkdown(entry))
    console.log('[fs] File written successfully:', filePath)

    // Maintain ID map for title-change tracking
    const mapPath = `${journalDir}/.idmap.json`
    let idMap: Record<string, string> = {}
    try {
      if (await exists(mapPath)) {
        idMap = JSON.parse(await readTextFile(mapPath))
      }
    } catch (e) {
      console.error('[fs] Error reading idmap:', e)
    }

    // Remove old filename if title changed
    const oldFilename = idMap[entry.id]
    if (oldFilename && oldFilename !== filename) {
      try {
        await remove(`${journalDir}/${oldFilename}`)
        console.log('[fs] Removed old file:', oldFilename)
      } catch (e) {
        console.error('[fs] Error removing old file:', e)
      }
    }

    idMap[entry.id] = filename
    await writeTextFile(mapPath, JSON.stringify(idMap, null, 2))
  } catch (e) {
    console.error('[fs] saveEntryToDisk FAILED:', e)
  }
}

export async function deleteEntryFromDisk(id: string, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return

  try {
    const { readTextFile, remove, writeTextFile, exists } = await import('@tauri-apps/plugin-fs')
    const journalDir = `${journalPath}/journal`
    const mapPath = `${journalDir}/.idmap.json`

    if (await exists(mapPath)) {
      const idMap: Record<string, string> = JSON.parse(await readTextFile(mapPath))
      const filename = idMap[id]
      if (filename) {
        await remove(`${journalDir}/${filename}`)
        delete idMap[id]
        await writeTextFile(mapPath, JSON.stringify(idMap, null, 2))
        console.log('[fs] Deleted entry from disk:', filename)
      }
    }
  } catch (e) {
    console.error('[fs] deleteEntryFromDisk FAILED:', e)
  }
}

export async function saveProfileToDisk(profile: PsychologicalProfile, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return

  try {
    const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs')
    if (!(await exists(journalPath))) {
      await mkdir(journalPath, { recursive: true })
    }
    await writeTextFile(`${journalPath}/profile.json`, JSON.stringify(profile, null, 2))
    console.log('[fs] Profile saved to disk')
  } catch (e) {
    console.error('[fs] saveProfileToDisk FAILED:', e)
  }
}

export async function loadEntriesFromDisk(journalPath: string): Promise<JournalEntry[]> {
  if (!hasFileSystem() || !journalPath) return []

  try {
    const { readDir, readTextFile, exists } = await import('@tauri-apps/plugin-fs')
    const journalDir = `${journalPath}/journal`

    if (!(await exists(journalDir))) return []

    const entries: JournalEntry[] = []
    const dirEntries = await readDir(journalDir)

    for (const file of dirEntries) {
      if (!file.name?.endsWith('.md')) continue
      try {
        const text = await readTextFile(`${journalDir}/${file.name}`)
        const { frontmatter, content } = parseMarkdown(text)
        entries.push({
          id: (frontmatter.id as string) || crypto.randomUUID(),
          title: (frontmatter.title as string) || file.name.replace('.md', ''),
          content,
          createdAt: (frontmatter.createdAt as string) || new Date().toISOString(),
          updatedAt: (frontmatter.updatedAt as string) || new Date().toISOString(),
          mood: (frontmatter.mood as JournalEntry['mood']) || null,
          tags: (frontmatter.tags as string[]) || [],
          summary: (frontmatter.summary as string) || null,
          indexed: (frontmatter.indexed as boolean) || false,
        })
      } catch (e) {
        console.error('[fs] Error reading entry file:', file.name, e)
      }
    }

    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (e) {
    console.error('[fs] loadEntriesFromDisk FAILED:', e)
    return []
  }
}

export async function grantFsScope(path: string): Promise<void> {
  if (!hasFileSystem() || !path) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('grant_fs_scope', { path })
    console.log('[fs] Granted scope for:', path)
  } catch (e) {
    console.error('[fs] Failed to grant scope:', e)
  }
}

export async function pickJournalDirectory(): Promise<string | null> {
  if (!hasFileSystem()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, title: 'Choose journal location' })
  if (selected) {
    // Grant fs scope for the selected directory
    await grantFsScope(selected as string)
  }
  return selected as string | null
}

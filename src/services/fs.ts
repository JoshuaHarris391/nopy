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
    const { mkdir, writeTextFile, exists } = await import('@tauri-apps/plugin-fs')
    const journalDir = `${journalPath}/journal`

    console.log('[fs] Saving entry to disk:', { id: entry.id, title: entry.title, dir: journalDir })

    if (!(await exists(journalDir))) {
      console.log('[fs] Creating journal directory:', journalDir)
      await mkdir(journalDir, { recursive: true })
    }

    // Use original filename if available, otherwise generate from title
    const filename = entry.sourceFilename || `${slugify(entry.title, entry.id)}.md`
    const filePath = `${journalDir}/${filename}`
    console.log('[fs] Writing file:', filePath)
    await writeTextFile(filePath, entryToMarkdown(entry))
    console.log('[fs] File written successfully:', filePath)
  } catch (e) {
    console.error('[fs] saveEntryToDisk FAILED:', e)
  }
}

export async function deleteEntryFromDisk(id: string, journalPath: string, sourceFilename?: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return

  try {
    const { remove, exists } = await import('@tauri-apps/plugin-fs')
    const journalDir = `${journalPath}/journal`

    if (sourceFilename) {
      const filePath = `${journalDir}/${sourceFilename}`
      if (await exists(filePath)) {
        await remove(filePath)
        console.log('[fs] Deleted entry from disk:', sourceFilename)
        return
      }
    }

    // Fallback: scan directory for a file containing this ID in frontmatter
    const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs')
    const files = await readDir(journalDir)
    for (const file of files) {
      if (!file.name?.endsWith('.md')) continue
      try {
        const text = await readTextFile(`${journalDir}/${file.name}`)
        if (text.includes(`id: "${id}"`)) {
          await remove(`${journalDir}/${file.name}`)
          console.log('[fs] Deleted entry from disk (by ID scan):', file.name)
          return
        }
      } catch { /* skip unreadable */ }
    }
    console.warn('[fs] Could not find file to delete for entry:', id)
  } catch (e) {
    console.error('[fs] deleteEntryFromDisk FAILED:', e)
  }
}

export async function saveProfileToDisk(profile: PsychologicalProfile, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return

  try {
    const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs')
    const profilesDir = `${journalPath}/profiles`
    if (!(await exists(profilesDir))) {
      await mkdir(profilesDir, { recursive: true })
    }
    await writeTextFile(`${profilesDir}/profile.json`, JSON.stringify(profile, null, 2))
    console.log('[fs] Profile saved to disk')

    if (profile.fullProfile) {
      await writeTextFile(`${profilesDir}/psychological-profile.md`, profile.fullProfile)
      console.log('[fs] Full psychological profile saved to disk')
    }
  } catch (e) {
    console.error('[fs] saveProfileToDisk FAILED:', e)
  }
}

function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/)
  if (!match) return null
  try {
    // Use the date from filename + current time as an estimate
    const now = new Date()
    const [year, month, day] = match[1].split('-').map(Number)
    const date = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds())
    if (isNaN(date.getTime())) return null
    return date.toISOString()
  } catch {
    return null
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
        const hasFrontmatter = Object.keys(frontmatter).length > 0

        // For files with frontmatter (created by nopy), use it directly
        // For plain markdown imports, infer metadata from filename
        const filenameDate = extractDateFromFilename(file.name)
        const nameWithoutExt = file.name.replace('.md', '')
        const titleAfterDate = nameWithoutExt
          .replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '') // strip date prefix
          .replace(/[-_]/g, ' ')
          .trim()
        // If filename is just a date (e.g. "2026-04-07.md"), keep date as title
        // If filename has text after date (e.g. "2026-04-07-morning-light.md"), use that text
        // If no date at all (e.g. "my-note.md"), use cleaned filename
        const titleFromFilename = titleAfterDate || nameWithoutExt

        entries.push({
          id: (frontmatter.id as string) || crypto.randomUUID(),
          title: hasFrontmatter
            ? (frontmatter.title as string) || file.name.replace('.md', '')
            : titleFromFilename || file.name.replace('.md', ''),
          content: hasFrontmatter ? content : text, // plain imports use full text as content
          createdAt: (frontmatter.createdAt as string) || filenameDate || new Date().toISOString(),
          updatedAt: (frontmatter.updatedAt as string) || filenameDate || new Date().toISOString(),
          mood: (frontmatter.mood as JournalEntry['mood']) || null,
          tags: (frontmatter.tags as string[]) || [],
          summary: (frontmatter.summary as string) || null,
          indexed: (frontmatter.indexed as boolean) || false,
          sourceFilename: file.name,
        })
      } catch (e) {
        console.error('[fs] Error reading entry file:', file.name, e)
      }
    }

    console.log(`[fs] Loaded ${entries.length} entries from disk`)
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

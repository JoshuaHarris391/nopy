import type { JournalEntry } from '../types/journal'
import type { PsychologicalProfile } from '../types/profile'
import { FrontmatterEntrySchema } from '../schemas/frontmatter'

export function hasFileSystem(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function slugify(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || id
}

export function entryToMarkdown(entry: JournalEntry): string {
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

export function parseMarkdown(text: string): { frontmatter: Record<string, unknown>; content: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
  if (!match) {
    console.log('[fs] parseMarkdown: no frontmatter found')
    return { frontmatter: {}, content: text }
  }

  const frontmatter: Record<string, unknown> = {}
  let parseFailures = 0
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(': ')
    if (idx === -1) continue
    const key = line.slice(0, idx)
    const value = line.slice(idx + 2)
    try {
      frontmatter[key] = JSON.parse(value)
    } catch {
      parseFailures++
      frontmatter[key] = value
    }
  }
  console.log('[fs] parseMarkdown: frontmatter keys', Object.keys(frontmatter).length, '| JSON parse failures', parseFailures)
  return { frontmatter, content: match[2] }
}

export async function saveEntryToDisk(entry: JournalEntry, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) {
    console.log('[fs] saveEntryToDisk skipped:', { hasFs: hasFileSystem(), journalPath })
    return
  }

  const { mkdir, writeTextFile, exists } = await import('@tauri-apps/plugin-fs')

  console.log('[fs] Saving entry to disk:', { id: entry.id, title: entry.title, dir: journalPath })

  if (!(await exists(journalPath))) {
    console.log('[fs] Creating journal directory:', journalPath)
    await mkdir(journalPath, { recursive: true })
  }

  const filename = entry.sourceFilename || `${slugify(entry.title, entry.id)}.md`
  const filePath = `${journalPath}/${filename}`
  console.log('[fs] Writing file:', filePath)
  await writeTextFile(filePath, entryToMarkdown(entry))
  console.log('[fs] File written successfully:', filePath)
}

export async function deleteEntryFromDisk(id: string, journalPath: string, sourceFilename?: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return

  const { remove, exists } = await import('@tauri-apps/plugin-fs')

  if (sourceFilename) {
    const filePath = `${journalPath}/${sourceFilename}`
    if (await exists(filePath)) {
      await remove(filePath)
      console.log('[fs] Deleted entry from disk:', sourceFilename)
      return
    }
  }

  // Fallback: scan directory for a file containing this ID in frontmatter
  const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs')
  const files = await readDir(journalPath)
  for (const file of files) {
    if (!file.name?.endsWith('.md')) continue
    try {
      const text = await readTextFile(`${journalPath}/${file.name}`)
      if (text.includes(`id: "${id}"`)) {
        await remove(`${journalPath}/${file.name}`)
        console.log('[fs] Deleted entry from disk (by ID scan):', file.name)
        return
      }
    } catch { /* skip unreadable */ }
  }
  console.warn('[fs] Could not find file to delete for entry:', id)
}

export async function saveProfileToDisk(profile: PsychologicalProfile, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return

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
}

export function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/)
  if (!match) return null
  try {
    // Use the date from filename + midday UTC to avoid timezone-shift issues
    const [year, month, day] = match[1].split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
    if (isNaN(date.getTime())) return null
    return date.toISOString()
  } catch {
    return null
  }
}

export async function loadEntriesFromDisk(journalPath: string): Promise<JournalEntry[]> {
  if (!hasFileSystem() || !journalPath) return []

  const { readDir, readTextFile, exists } = await import('@tauri-apps/plugin-fs')

  if (!(await exists(journalPath))) return []

  const entries: JournalEntry[] = []
  const dirEntries = await readDir(journalPath)

  for (const file of dirEntries) {
    if (!file.name?.endsWith('.md')) continue
    try {
      const text = await readTextFile(`${journalPath}/${file.name}`)
      const { frontmatter, content } = parseMarkdown(text)
      const rawHasFrontmatter = Object.keys(frontmatter).length > 0

      // Validate frontmatter through schema — discard bad metadata but preserve content
      const frontmatterResult = FrontmatterEntrySchema.safeParse(frontmatter)
      if (!frontmatterResult.success) {
        console.warn('[fs] Invalid frontmatter in', file.name, frontmatterResult.error.issues)
      }
      const fm = frontmatterResult.success ? frontmatterResult.data : null
      const hasFrontmatter = rawHasFrontmatter && fm !== null

      const filenameDate = extractDateFromFilename(file.name)
      const nameWithoutExt = file.name.replace('.md', '')
      const titleAfterDate = nameWithoutExt
        .replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '')
        .replace(/[-_]/g, ' ')
        .trim()
      const titleFromFilename = titleAfterDate || nameWithoutExt

      console.log('[fs] loadEntriesFromDisk: file', file.name, '| type', hasFrontmatter ? 'nopy' : 'plain import', '| frontmatter valid', frontmatterResult.success)
      entries.push({
        id: fm?.id || crypto.randomUUID(),
        title: hasFrontmatter
          ? fm?.title || file.name.replace('.md', '')
          : titleFromFilename || file.name.replace('.md', ''),
        content: hasFrontmatter ? content : text,
        createdAt: fm?.createdAt || filenameDate || new Date().toISOString(),
        updatedAt: fm?.updatedAt || filenameDate || new Date().toISOString(),
        mood: fm?.mood ?? null,
        tags: fm?.tags ?? [],
        summary: fm?.summary ?? null,
        indexed: hasFrontmatter ? (fm?.indexed ?? false) : false,
        sourceFilename: file.name,
      })
    } catch (e) {
      console.error('[fs] Error reading entry file:', file.name, e)
    }
  }

  console.log(`[fs] Loaded ${entries.length} entries from disk`)
  return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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

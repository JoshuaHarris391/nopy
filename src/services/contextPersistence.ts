import { stringify as yamlStringify } from 'yaml'
import { hasFileSystem, slugify, parseMarkdown } from './fs'
import type { ContextNote, ContextInjection } from '../types/context'

const CONTEXT_DIR = 'context'

function noteToMarkdown(note: ContextNote): string {
  const frontmatter: Record<string, unknown> = {
    id: note.id,
    title: note.title,
    tags: note.tags,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
  const yaml = yamlStringify(frontmatter).trimEnd()
  return `---\n${yaml}\n---\n\n${note.content}`
}

export async function saveContextNoteToDisk(
  note: ContextNote,
  journalPath: string,
  oldFilename?: string,
): Promise<string> {
  const filename = `${slugify(note.title, note.id)}.md`
  if (!hasFileSystem() || !journalPath) return filename

  const { mkdir, writeTextFile, exists, remove } = await import('@tauri-apps/plugin-fs')
  const dir = `${journalPath}/${CONTEXT_DIR}`
  if (!(await exists(dir))) await mkdir(dir, { recursive: true })

  if (oldFilename && oldFilename !== filename) {
    const oldPath = `${dir}/${oldFilename}`
    if (await exists(oldPath)) await remove(oldPath)
  }

  await writeTextFile(`${dir}/${filename}`, noteToMarkdown(note))
  return filename
}

export async function deleteContextNoteFromDisk(filename: string | undefined, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath || !filename) return
  const { remove, exists } = await import('@tauri-apps/plugin-fs')
  const path = `${journalPath}/${CONTEXT_DIR}/${filename}`
  if (await exists(path)) await remove(path)
}

export async function loadContextNotesFromDisk(journalPath: string): Promise<ContextNote[]> {
  if (!hasFileSystem() || !journalPath) return []
  const { readDir, readTextFile, exists } = await import('@tauri-apps/plugin-fs')
  const dir = `${journalPath}/${CONTEXT_DIR}`
  if (!(await exists(dir))) return []

  const notes: ContextNote[] = []
  for (const file of await readDir(dir)) {
    if (!file.name?.endsWith('.md')) continue
    try {
      const text = await readTextFile(`${dir}/${file.name}`)
      const { frontmatter, content } = parseMarkdown(text)
      const fm = frontmatter as Record<string, unknown>
      notes.push({
        id: typeof fm.id === 'string' ? fm.id : crypto.randomUUID(),
        title: typeof fm.title === 'string' ? fm.title : file.name.replace('.md', ''),
        content,
        tags: Array.isArray(fm.tags) ? fm.tags.filter((t): t is string => typeof t === 'string') : [],
        createdAt: typeof fm.createdAt === 'string' ? fm.createdAt : new Date().toISOString(),
        updatedAt: typeof fm.updatedAt === 'string' ? fm.updatedAt : new Date().toISOString(),
        sourceFilename: file.name,
      })
    } catch (e) {
      console.error('[contextPersistence] Failed to read note', file.name, e)
    }
  }
  return notes
}

export async function saveManifestToDisk(injection: ContextInjection[], journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return
  const { mkdir, writeTextFile, exists } = await import('@tauri-apps/plugin-fs')
  const dir = `${journalPath}/${CONTEXT_DIR}`
  if (!(await exists(dir))) await mkdir(dir, { recursive: true })
  await writeTextFile(`${dir}/manifest.json`, JSON.stringify(injection, null, 2))
}

export async function loadManifestFromDisk(journalPath: string): Promise<ContextInjection[] | null> {
  if (!hasFileSystem() || !journalPath) return null
  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')
  const path = `${journalPath}/${CONTEXT_DIR}/manifest.json`
  if (!(await exists(path))) return null
  try {
    const parsed = JSON.parse(await readTextFile(path))
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter((x) => x && typeof x.id === 'string')
      .map((x) => ({ id: x.id as string, injected: !!x.injected, order: Number(x.order) || 0 }))
  } catch (e) {
    console.warn('[contextPersistence] manifest parse failed:', e)
    return null
  }
}

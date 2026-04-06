import type { JournalEntry } from '../types/journal'
import type { PsychologicalProfile } from '../types/profile'

export function hasFileSystem(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

export async function saveEntryToDisk(_entry: JournalEntry, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return
  // Tauri implementation added in Phase 2
}

export async function deleteEntryFromDisk(_id: string, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return
  // Tauri implementation added in Phase 2
}

export async function saveProfileToDisk(_profile: PsychologicalProfile, journalPath: string): Promise<void> {
  if (!hasFileSystem() || !journalPath) return
  // Tauri implementation added in Phase 2
}

export async function loadEntriesFromDisk(journalPath: string): Promise<JournalEntry[]> {
  if (!hasFileSystem() || !journalPath) return []
  // Tauri implementation added in Phase 2
  return []
}

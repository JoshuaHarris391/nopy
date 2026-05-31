import { flushChatSave } from './chatPersistence'
import { grantFsScope } from './fs'
import { useSettingsStore } from '../stores/settingsStore'
import { useJournalStore } from '../stores/journalStore'
import { useProfileStore } from '../stores/profileStore'
import { useChatStore } from '../stores/chatStore'
import { useContextStore } from '../stores/contextStore'

export interface JournalSwitchResult {
  added: number
  profileLoaded: boolean
  contextNotes: number
}

/**
 * Point the app at a different journal folder.
 *
 * Every per-journal cache (entries, chat sessions, profile, context notes) is
 * wiped and then rebuilt from the target folder so that the files on disk are
 * always the source of truth — nothing leaks from the journal we're leaving.
 * This is the single place that owns the "clear all, reload all" contract;
 * forgetting one store here is exactly how stale data bleeds across journals.
 *
 * Used for both switching to an existing journal and switching into a freshly
 * created (empty) folder.
 */
export async function switchJournal(path: string): Promise<JournalSwitchResult> {
  // Persist any debounced chat writes against the *current* journal first.
  await flushChatSave()

  // Wipe every per-journal cache (Zustand state + IndexedDB keys).
  await useChatStore.getState().clear()
  await useJournalStore.getState().clear()
  await useProfileStore.getState().clear()
  await useContextStore.getState().clear()

  useSettingsStore.getState().setJournalPath(path)
  await grantFsScope(path)

  // Rebuild every cache from the new folder. Each load runs against the empty
  // cache above, so disk wins: loadContext() in particular reads the new
  // journal's context/ folder rather than returning the previous journal's
  // cached notes.
  await useJournalStore.getState().loadEntries()
  const { added } = await useJournalStore.getState().syncFromDisk()
  await useChatStore.getState().loadSessionList()
  const profileLoaded = await useProfileStore.getState().loadProfileFromDisk()
  await useContextStore.getState().loadContext()
  const contextNotes = useContextStore.getState().notes.length

  return { added, profileLoaded, contextNotes }
}

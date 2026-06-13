import { set as idbSet } from 'idb-keyval'

/**
 * Shared disk-save tail for stores that mirror items to markdown files
 * (journal entries, context notes). Writes the item to disk, reconciles the
 * generated filename back into state + IDB when it changed (first save, or
 * a title rename), and surfaces failures via lastError while keeping the
 * in-memory/IDB copy — the app is offline-first, so a disk failure must not
 * lose the user's text. Rethrows so callers can also react to the failure.
 */
export async function saveToDiskAndReconcileFilename<T extends { id: string; title: string; sourceFilename?: string }>({
  item,
  oldFilename,
  journalPath,
  saveToDisk,
  idbKey,
  getItems,
  setItems,
  setLastError,
}: {
  item: T
  oldFilename?: string
  journalPath: string
  saveToDisk: (item: T, journalPath: string, oldFilename?: string) => Promise<string>
  idbKey: string
  getItems: () => T[]
  setItems: (items: T[]) => void
  setLastError: (message: string) => void
}): Promise<void> {
  try {
    const filename = await saveToDisk(item, journalPath, oldFilename)
    if (filename !== item.sourceFilename) {
      const updated = getItems().map((i) => (i.id === item.id ? { ...i, sourceFilename: filename } : i))
      setItems(updated)
      await idbSet(idbKey, updated)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    setLastError(`Failed to save "${item.title}" to disk: ${msg}`)
    throw e
  }
}

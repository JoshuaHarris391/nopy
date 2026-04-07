import { useState, useCallback, useRef, useEffect } from 'react'
import { Eye, EyeOff, FolderOpen, Zap, BookOpen, Sun, Moon } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { ProgressBar } from '../ui/ProgressBar'
import { Button } from '../ui/Button'
import { useSettingsStore } from '../../stores/settingsStore'
import { useJournalStore } from '../../stores/journalStore'
import { useProfileStore } from '../../stores/profileStore'
import { hasFileSystem, pickJournalDirectory, grantFsScope } from '../../services/fs'
import { del } from 'idb-keyval'

export function SettingsView() {
  const { apiKey, setApiKey, preferredModel, setPreferredModel, maxOutputTokens, setMaxOutputTokens, contextBudget, setContextBudget, journalPath, setJournalPath, theme, setTheme } = useSettingsStore()
  const [availableModels, setAvailableModels] = useState<{ id: string; displayName: string }[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const canPickDirectory = hasFileSystem()
  const [showKey, setShowKey] = useState(false)
  const [keyInput, setKeyInput] = useState(apiKey)
  const [showNewJournalConfirm, setShowNewJournalConfirm] = useState(false)
  const [newJournalStatus, setNewJournalStatus] = useState<string | null>(null)
  const [forceProcessing, setForceProcessing] = useState(false)
  const [forceProgress, setForceProgress] = useState<{ current: number; total: number; title: string }>({ current: 0, total: 0, title: '' })
  const [forceResult, setForceResult] = useState<string | null>(null)
  const forceAbortRef = useRef<AbortController | null>(null)
  const [forceHovered, setForceHovered] = useState(false)

  const handleForceUpdate = useCallback(async () => {
    if (!apiKey) return
    if (forceProcessing) {
      forceAbortRef.current?.abort()
      return
    }
    const controller = new AbortController()
    forceAbortRef.current = controller
    setForceProcessing(true)
    setForceResult(null)
    try {
      const count = await useJournalStore.getState().processEntries(apiKey, true, (current, total, title) => {
        setForceProgress({ current, total, title })
      }, controller.signal)
      setForceResult(`${count} ${count === 1 ? 'entry' : 'entries'} reprocessed`)
      setTimeout(() => setForceResult(null), 3000)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setForceResult('Cancelled')
      } else {
        setForceResult('Reprocessing failed')
      }
      setTimeout(() => setForceResult(null), 3000)
    } finally {
      forceAbortRef.current = null
      setForceProcessing(false)
    }
  }, [forceProcessing, apiKey])

  const handleNewJournal = useCallback(async () => {
    const path = await pickJournalDirectory()
    if (!path) return

    console.log('[new-journal] Selected path:', path)

    // Clear IndexedDB entries and profile
    await del('nopy-entries')
    await del('nopy-profile')
    useJournalStore.setState({ entries: [], loaded: false })
    useProfileStore.setState({ profile: null, loaded: false })

    // Set new path and grant scope
    setJournalPath(path)
    await grantFsScope(path)

    console.log('[new-journal] Path set, scope granted. Current settings path:', useSettingsStore.getState().journalPath)

    // Sync from the new location
    await useJournalStore.getState().loadEntries()
    console.log('[new-journal] Entries after loadEntries:', useJournalStore.getState().entries.length)
    const { added } = await useJournalStore.getState().syncFromDisk()
    setNewJournalStatus(`Switched to new journal — ${added} entries loaded`)
    setTimeout(() => setNewJournalStatus(null), 4000)
    setShowNewJournalConfirm(false)
  }, [setJournalPath])

  const handleKeyBlur = () => {
    setApiKey(keyInput.trim())
  }

  useEffect(() => {
    if (!apiKey) return
    setModelsLoading(true)
    setModelsError(null)
    import('../../services/anthropic').then(({ fetchModels }) =>
      fetchModels(apiKey)
        .then((models) => setAvailableModels(models))
        .catch(() => setModelsError('Failed to load models'))
        .finally(() => setModelsLoading(false))
    )
  }, [apiKey])

  return (
    <>
      <MainHeader title="Settings" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '36px 44px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>

          {/* Appearance */}
          <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--stone)' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 14 }}>
              Appearance
            </h3>
            <div className="flex justify-between items-center" style={{ padding: '10px 0' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Theme</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
                  Switch between light and dark mode
                </div>
              </div>
              <div className="flex" style={{ border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <button
                  onClick={() => setTheme('light')}
                  className="flex items-center gap-1.5 cursor-pointer"
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 12,
                    padding: '6px 12px',
                    border: 'none',
                    background: theme === 'light' ? 'var(--forest)' : 'transparent',
                    color: theme === 'light' ? '#fff' : 'var(--ink)',
                    transition: 'all var(--transition-gentle)',
                  }}
                >
                  <Sun size={13} strokeWidth={1.8} />
                  Light
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className="flex items-center gap-1.5 cursor-pointer"
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 12,
                    padding: '6px 12px',
                    border: 'none',
                    borderLeft: '1px solid var(--stone)',
                    background: theme === 'dark' ? 'var(--forest)' : 'transparent',
                    color: theme === 'dark' ? '#fff' : 'var(--ink)',
                    transition: 'all var(--transition-gentle)',
                  }}
                >
                  <Moon size={13} strokeWidth={1.8} />
                  Dark
                </button>
              </div>
            </div>
          </div>

          {/* API Configuration */}
          <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--stone)' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 14 }}>
              API Configuration
            </h3>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)', marginBottom: 4 }}>
                Anthropic API Key
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginBottom: 8 }}>
                Your key stays local and is never sent to any server other than Anthropic's API.
              </div>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onBlur={handleKeyBlur}
                  placeholder="sk-ant-..."
                  style={{
                    width: '100%',
                    padding: '9px 40px 9px 13px',
                    border: '1px solid var(--stone)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12.5,
                    color: 'var(--ink)',
                    background: 'var(--warm-cream)',
                    outline: 'none',
                    transition: 'border-color var(--transition-gentle)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--bark)')}
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ background: 'none', border: 'none', color: 'var(--sage)' }}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center" style={{ padding: '10px 0' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Model</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
                  Used for chat conversations
                </div>
              </div>
              <select
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                disabled={modelsLoading || !apiKey}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  padding: '6px 12px',
                  border: '1px solid var(--stone)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--warm-cream)',
                  color: modelsLoading || !apiKey ? 'var(--sage)' : 'var(--ink)',
                  outline: 'none',
                  cursor: modelsLoading || !apiKey ? 'not-allowed' : 'pointer',
                  minWidth: 200,
                }}
              >
                {modelsLoading && <option value="">Loading models…</option>}
                {modelsError && <option value="">{modelsError}</option>}
                {!apiKey && <option value="">Enter API key to load models</option>}
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
                {!modelsLoading && !modelsError && apiKey && availableModels.length === 0 && (
                  <option value="">No models found</option>
                )}
              </select>
              {modelsError && (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--error, #c0392b)', marginTop: 4 }}>
                  {modelsError}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center" style={{ padding: '10px 0' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Max Output Tokens</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
                  Maximum length of each AI response (default: 4,096)
                </div>
              </div>
              <select
                value={maxOutputTokens}
                onChange={(e) => setMaxOutputTokens(Number(e.target.value))}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  padding: '6px 12px',
                  border: '1px solid var(--stone)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--warm-cream)',
                  color: 'var(--ink)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={1024}>1,024</option>
                <option value={2048}>2,048</option>
                <option value={4096}>4,096</option>
                <option value={8192}>8,192</option>
                <option value={16384}>16,384</option>
                <option value={32768}>32,768</option>
              </select>
            </div>

            <div className="flex justify-between items-center" style={{ padding: '10px 0' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Context Budget</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
                  How much conversation history to send with each message (default: 500,000)
                </div>
              </div>
              <select
                value={contextBudget}
                onChange={(e) => setContextBudget(Number(e.target.value))}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  padding: '6px 12px',
                  border: '1px solid var(--stone)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--warm-cream)',
                  color: 'var(--ink)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={8000}>8,000</option>
                <option value={30000}>30,000</option>
                <option value={60000}>60,000</option>
                <option value={100000}>100,000</option>
                <option value={200000}>200,000</option>
                <option value={500000}>500,000</option>
                <option value={1000000}>1,000,000</option>
              </select>
            </div>
          </div>

          {/* Data & Privacy */}
          <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--stone)' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 14 }}>
              Data & Privacy
            </h3>

            <div className="flex justify-between items-center" style={{ padding: '10px 0' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Journal location</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sage)', marginTop: 2 }}>
                  {journalPath || (canPickDirectory ? 'Not set — entries stored in browser only' : 'Run the desktop app to save entries as local files')}
                </div>
              </div>
              {canPickDirectory && (
                <button
                  onClick={async () => {
                    const path = await pickJournalDirectory()
                    if (path) setJournalPath(path)
                  }}
                  className="flex items-center gap-1.5 cursor-pointer"
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 12,
                    padding: '6px 12px',
                    border: '1px solid var(--stone)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    color: 'var(--ink)',
                    transition: 'all var(--transition-gentle)',
                  }}
                >
                  <FolderOpen size={13} strokeWidth={1.8} />
                  Change
                </button>
              )}
            </div>

            {/* New Journal */}
            {canPickDirectory && (
              <div className="flex justify-between items-center" style={{ padding: '10px 0' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Switch journal</div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
                    Point to a different folder — clears current entries from the app and loads from the new location
                  </div>
                </div>
                <button
                  onClick={() => setShowNewJournalConfirm(true)}
                  className="flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 12,
                    padding: '6px 12px',
                    border: '1px solid var(--stone)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    color: 'var(--ink)',
                    transition: 'all var(--transition-gentle)',
                  }}
                >
                  <BookOpen size={13} strokeWidth={1.8} />
                  New Journal
                </button>
              </div>
            )}

            {newJournalStatus && (
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)', padding: '8px 0' }}>
                {newJournalStatus}
              </div>
            )}
          </div>

          {/* Maintenance */}
          {apiKey && (
            <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--stone)' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 14 }}>
                Maintenance
              </h3>

              <div style={{ padding: '10px 0' }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Force Update Index</div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
                    Reprocess all entries with AI, overwriting existing metadata
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleForceUpdate}
                    onMouseEnter={() => setForceHovered(true)}
                    onMouseLeave={() => setForceHovered(false)}
                    className={forceProcessing ? 'btn-cancellable' : undefined}
                  >
                    {forceProcessing ? (
                      <>
                        <span style={{ visibility: forceHovered ? 'hidden' : 'visible' }}><Zap size={13} strokeWidth={1.8} />Reprocessing...</span>
                        <span style={{ visibility: forceHovered ? 'visible' : 'hidden' }}><Zap size={13} strokeWidth={1.8} />Stop</span>
                      </>
                    ) : (
                      <><Zap size={13} strokeWidth={1.8} />Force Update Index</>
                    )}
                  </Button>
                  {forceResult && (
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gentle-green)', fontWeight: 500 }}>
                      {forceResult}
                    </span>
                  )}
                </div>
                {forceProcessing && (
                  <div style={{ marginTop: 12 }}>
                    <ProgressBar current={forceProgress.current} total={forceProgress.total} label={forceProgress.title} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* About */}
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 14 }}>
              About
            </h3>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)', lineHeight: 1.6 }}>
              nopy — shelter for your inner world. An open-source, locally-deployed AI-assisted journaling app. Your data never leaves your machine.
            </p>
          </div>
        </div>
      </div>

      {/* New Journal confirmation */}
      {showNewJournalConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(44, 62, 44, 0.3)' }}
          onClick={() => setShowNewJournalConfirm(false)}
        >
          <div
            className="flex flex-col gap-4"
            style={{
              background: 'var(--parchment)',
              border: '1px solid var(--stone)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px 32px',
              maxWidth: 420,
              boxShadow: '0 12px 40px var(--shadow-warm-deep)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
              Switch to a new journal?
            </h3>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.6 }}>
              This will clear the current entries and profile from the app and load entries from the new folder you select. Your existing files on disk are not affected.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowNewJournalConfirm(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleNewJournal}>
                <FolderOpen size={14} strokeWidth={2} />
                Choose folder
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

import { useState } from 'react'
import { Eye, EyeOff, FolderOpen } from 'lucide-react'
import { MainHeader } from '../ui/MainHeader'
import { useSettingsStore } from '../../stores/settingsStore'
import { hasFileSystem, pickJournalDirectory } from '../../services/fs'

export function SettingsView() {
  const { apiKey, setApiKey, preferredModel, setPreferredModel, sidebarCollapsed, toggleSidebar, journalPath, setJournalPath } = useSettingsStore()
  const canPickDirectory = hasFileSystem()
  const [showKey, setShowKey] = useState(false)
  const [keyInput, setKeyInput] = useState(apiKey)

  const handleKeyBlur = () => {
    setApiKey(keyInput.trim())
  }

  return (
    <>
      <MainHeader title="Settings" />
      <div className="flex-1 overflow-y-auto" style={{ padding: '36px 44px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>

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
                <option value="claude-opus-4-6">Claude Opus 4.6</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
              </select>
            </div>
          </div>

          {/* Preferences */}
          <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--stone)' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 14 }}>
              Preferences
            </h3>

            <div className="flex justify-between items-center" style={{ padding: '10px 0' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>Compact sidebar</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginTop: 2 }}>
                  Show only icons in the sidebar
                </div>
              </div>
              <button
                onClick={toggleSidebar}
                className="relative flex-shrink-0 cursor-pointer"
                style={{
                  width: 42,
                  height: 23,
                  borderRadius: 12,
                  background: sidebarCollapsed ? 'var(--amber)' : 'var(--stone)',
                  border: 'none',
                  transition: 'background var(--transition-gentle)',
                }}
              >
                <div
                  className="absolute rounded-full"
                  style={{
                    width: 19,
                    height: 19,
                    background: 'white',
                    top: 2,
                    left: 2,
                    transition: 'transform var(--transition-gentle)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                    transform: sidebarCollapsed ? 'translateX(19px)' : 'translateX(0)',
                  }}
                />
              </button>
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
          </div>

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
    </>
  )
}

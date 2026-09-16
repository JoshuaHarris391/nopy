import { useEffect, useState, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { marked } from 'marked'
import { MainHeader } from '../ui/MainHeader'
import { LeafCatcherGame } from './LeafCatcherGame'
import { Button } from '../ui/Button'
import { ProfileSection } from '../ui/ProfileSection'
import { ProfileScopeControl } from './ProfileScopeControl'
import { ProfileBuildControl } from './ProfileBuildControl'
import { ProfileHistoryPanel } from './ProfileHistoryPanel'
import { useProfileStore } from '../../stores/profileStore'
import { useJournalStore } from '../../stores/journalStore'
import { useShallow } from 'zustand/react/shallow'
import { useSettingsStore, selectLlmConfig } from '../../stores/settingsStore'
import { isLlmConfigured } from '../../services/llm'
import { isStaleIndex, applyProfileScope, describeScope } from '../../services/entryRecords'

/**
 * The AI-generated profile and its controls only. Locally computed charts
 * and wellbeing metrics live on the Insights page.
 */
export function ProfileView() {
  const profile = useProfileStore((s) => s.profile)
  const loaded = useProfileStore((s) => s.loaded)
  const loadProfile = useProfileStore((s) => s.loadProfile)
  const generating = useProfileStore((s) => s.generating)
  const journalLoaded = useJournalStore((s) => s.loaded)
  const loadEntries = useJournalStore((s) => s.loadEntries)
  const entries = useJournalStore((s) => s.entries)
  const llmConfig = useSettingsStore(useShallow(selectLlmConfig))
  const scope = useSettingsStore((s) => s.profileScope)
  const setProfileScope = useSettingsStore((s) => s.setProfileScope)
  const buildMode = useSettingsStore((s) => s.profileGenerationMode)
  const setBuildMode = useSettingsStore((s) => s.setProfileGenerationMode)
  const ready = isLlmConfigured(llmConfig)
  const [showFullProfile, setShowFullProfile] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [profileHovered, setProfileHovered] = useState(false)
  const staleCount = useMemo(() => entries.filter(isStaleIndex).length, [entries])
  const inScope = useMemo(() => applyProfileScope(entries, scope).filter((e) => e.indexed).length, [entries, scope])
  const indexedTotal = useMemo(() => entries.filter((e) => e.indexed).length, [entries])

  useEffect(() => {
    if (!loaded) loadProfile()
    if (!journalLoaded) loadEntries()
  }, [loaded, loadProfile, journalLoaded, loadEntries])

  const handleGenerateProfile = () => {
    if (!ready) return
    if (generating) {
      abortRef.current?.abort()
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    const entries = useJournalStore.getState().entries
    useProfileStore.getState().generateProfile(entries, llmConfig, controller.signal).finally(() => {
      abortRef.current = null
    })
  }

  return (
    <>
      <style>{`
        .profile-markdown h1 { font-family: var(--font-display); font-size: 26px; font-weight: 600; color: var(--ink); margin: 32px 0 16px; line-height: 1.3; }
        .profile-markdown h2 { font-family: var(--font-heading); font-size: 20px; font-weight: 500; color: var(--ink); margin: 28px 0 12px; line-height: 1.4; }
        .profile-markdown h3 { font-family: var(--font-heading); font-size: 16px; font-weight: 500; color: var(--bark); margin: 20px 0 8px; line-height: 1.4; }
        .profile-markdown p { margin: 0 0 14px; }
        .profile-markdown ul, .profile-markdown ol { margin: 0 0 14px; padding-left: 24px; }
        .profile-markdown li { margin-bottom: 4px; }
        .profile-markdown blockquote { border-left: 3px solid var(--amber); padding: 8px 16px; margin: 16px 0; color: var(--bark); font-style: italic; background: var(--warm-cream); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
        .profile-markdown strong { font-weight: 600; color: var(--ink); }
        .profile-markdown hr { border: none; border-top: 1px solid var(--stone); margin: 24px 0; }
      `}</style>
      <MainHeader title="Psychological Profile">
        {profile && (
          <span data-testid="profile-selected-line" style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--sage)' }}>
            Selected: {new Date(profile.createdAt ?? profile.updatedAt).toLocaleDateString()} · {profile.entriesAnalyzed} entries · {describeScope(profile.scope)}
          </span>
        )}
        {ready && (
          <>
            <ProfileScopeControl scope={scope} onChange={setProfileScope} disabled={generating} />
            <ProfileBuildControl mode={buildMode} onChange={setBuildMode} disabled={generating} />
            <Button
              variant="primary"
              onClick={handleGenerateProfile}
              onMouseEnter={() => setProfileHovered(true)}
              onMouseLeave={() => setProfileHovered(false)}
              className={generating ? 'btn-cancellable' : undefined}
            >
              {generating ? (
                <>
                  <span style={{ visibility: profileHovered ? 'hidden' : 'visible' }}><RefreshCw size={13} strokeWidth={1.8} style={{ animation: 'spin 1s linear infinite' }} />Creating</span>
                  <span style={{ visibility: profileHovered ? 'visible' : 'hidden' }}><RefreshCw size={13} strokeWidth={1.8} />Stop</span>
                </>
              ) : (
                <><RefreshCw size={13} strokeWidth={1.8} />Generate</>
              )}
            </Button>
            {profile?.fullProfile && (
              <Button variant="secondary" onClick={() => setShowFullProfile(!showFullProfile)}>
                {showFullProfile ? 'Overview' : 'View Full Profile'}
              </Button>
            )}
          </>
        )}
      </MainHeader>
      <div className="flex-1 overflow-y-auto" style={{ padding: generating && !profile ? 0 : '36px 44px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {ready && !generating && (
          <div
            data-testid="scope-count"
            style={{ maxWidth: 760, margin: '0 auto 12px', width: '100%', fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--sage)' }}
          >
            Next generation uses {inScope} of {indexedTotal} indexed {indexedTotal === 1 ? 'entry' : 'entries'} ({describeScope(scope)}).
            {' '}<Link to="/insights" style={{ color: 'var(--bark)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3 }}><TrendingUp size={12} />Charts are in Insights</Link>
          </div>
        )}
        {ready && !generating && staleCount > 0 && (
          <div
            data-testid="stale-index-hint"
            style={{
              maxWidth: 760, margin: '0 auto 20px', width: '100%',
              fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--sage)',
              padding: '8px 12px', background: 'var(--warm-cream)', border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
            }}
          >
            {staleCount === 1 ? '1 entry uses' : `${staleCount} entries use`} an older index.{' '}
            <Link to="/settings" style={{ color: 'var(--bark)', textDecoration: 'underline' }}>Re-index in Settings</Link> for a richer profile.
          </div>
        )}
        {!generating && <ProfileHistoryPanel />}
        {(!profile || generating) && !showFullProfile ? (
          <>
            <LeafCatcherGame />
          </>
        ) : (
        <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
          {showFullProfile && profile!.fullProfile ? (
            <div
              className="profile-markdown"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                lineHeight: 1.8,
                color: 'var(--manuscript)',
                maxWidth: 760,
                margin: '0 auto',
              }}
              dangerouslySetInnerHTML={{ __html: marked(profile!.fullProfile) as string }}
            />
          ) : (
            <>
              {/* Summary */}
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 500, color: 'var(--ink)', marginBottom: 16 }}>
                Summary
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-agent)',
                  fontSize: 16,
                  lineHeight: 1.8,
                  color: 'var(--manuscript)',
                  padding: '22px 26px',
                  background: 'var(--warm-cream)',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: '3px solid var(--amber)',
                  marginBottom: 32,
                  fontStyle: 'italic',
                  fontWeight: 400,
                }}
              >
                {profile!.summary}
              </div>

              {/* Themes */}
              {profile!.themes.length > 0 && (
                <ProfileSection title="Recurring Themes">
                  <div className="flex flex-wrap gap-2">
                    {profile!.themes.map((theme, i) => (
                      <span
                        key={theme.theme}
                        style={{
                          fontFamily: 'var(--font-ui)',
                          fontSize: 13.5,
                          padding: '5px 13px',
                          background: i < 2 ? 'var(--bark)' : 'var(--warm-cream)',
                          border: i < 2 ? '1px solid var(--bark)' : '1px solid var(--stone)',
                          borderRadius: 20,
                          color: i < 2 ? 'white' : 'var(--bark)',
                          fontWeight: 500,
                          cursor: 'default',
                          transition: 'all var(--transition-gentle)',
                        }}
                      >
                        {theme.theme}
                      </span>
                    ))}
                  </div>
                </ProfileSection>
              )}

              {/* Strengths */}
              {profile!.strengths.length > 0 && (
                <ProfileSection title="Strengths">
                  <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0 }}>
                    {profile!.strengths.map((s) => (
                      <li key={s} className="flex items-start gap-2" style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--manuscript)', lineHeight: 1.6 }}>
                        <span style={{ color: 'var(--gentle-green)', marginTop: 2 }}>●</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </ProfileSection>
              )}

              {/* Cognitive patterns */}
              {profile!.cognitivePatterns.length > 0 && (
                <ProfileSection title="Therapeutic Observations">
                  <div className="flex flex-col gap-2.5">
                    {profile!.cognitivePatterns.map((p) => (
                      <div
                        key={p.pattern}
                        style={{
                          fontFamily: 'var(--font-agent)',
                          fontSize: 14,
                          color: 'var(--bark)',
                          padding: '14px 18px',
                          background: 'rgba(139, 115, 85, 0.06)',
                          borderRadius: 'var(--radius-sm)',
                          lineHeight: 1.6,
                          fontWeight: 400,
                          borderLeft: '2px solid var(--amber)',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-ui)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            fontSize: 10,
                            letterSpacing: '0.06em',
                            display: 'block',
                            marginBottom: 3,
                            opacity: 0.65,
                          }}
                        >
                          {p.framework} Pattern
                        </span>
                        {p.description}
                      </div>
                    ))}
                  </div>
                </ProfileSection>
              )}

              {/* Framework insights */}
              {profile!.frameworkInsights.length > 0 && (
                <ProfileSection title="Framework Insights">
                  <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0 }}>
                    {profile!.frameworkInsights.map((f) => (
                      <li key={f} className="flex items-start gap-2" style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--manuscript)', lineHeight: 1.6 }}>
                        <span style={{ color: 'var(--dusk-blue)', marginTop: 2 }}>●</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </ProfileSection>
              )}

              {/* Growth Areas */}
              {profile!.growthAreas.length > 0 && (
                <ProfileSection title="Growth Areas">
                  <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0 }}>
                    {profile!.growthAreas.map((g) => (
                      <li key={g} className="flex items-start gap-2" style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--manuscript)', lineHeight: 1.6 }}>
                        <span style={{ color: 'var(--amber)', marginTop: 2 }}>●</span>
                        {g}
                      </li>
                    ))}
                  </ul>
                </ProfileSection>
              )}
            </>
          )}
        </div>
        )}
      </div>
    </>
  )
}

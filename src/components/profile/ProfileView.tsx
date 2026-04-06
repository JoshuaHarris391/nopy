import { useEffect, useState, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { marked } from 'marked'
import { MainHeader } from '../ui/MainHeader'
import { LeafCatcherGame } from './LeafCatcherGame'
import { ProgressBar } from '../ui/ProgressBar'
import { Button } from '../ui/Button'
import { useProfileStore } from '../../stores/profileStore'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore } from '../../stores/settingsStore'

export function ProfileView() {
  const { profile, loaded, loadProfile, generating, phase, progress } = useProfileStore()
  const { loaded: journalLoaded, loadEntries } = useJournalStore()
  const apiKey = useSettingsStore((s) => s.apiKey)
  const [showFullProfile, setShowFullProfile] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [profileHovered, setProfileHovered] = useState(false)

  useEffect(() => {
    if (!loaded) loadProfile()
    if (!journalLoaded) loadEntries()
  }, [loaded, loadProfile, journalLoaded, loadEntries])

  const handleGenerateProfile = () => {
    if (!apiKey) return
    if (generating) {
      abortRef.current?.abort()
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    const entries = useJournalStore.getState().entries
    useProfileStore.getState().generateProfile(entries, apiKey, controller.signal).finally(() => {
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
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--sage)' }}>
            Last updated: {new Date(profile.updatedAt).toLocaleDateString()} · {profile.entriesAnalysed} entries analysed
          </span>
        )}
        {apiKey && (
          <>
            <Button
              variant="primary"
              onClick={handleGenerateProfile}
              onMouseEnter={() => setProfileHovered(true)}
              onMouseLeave={() => setProfileHovered(false)}
              className={generating ? 'btn-cancellable' : undefined}
            >
              {generating ? (
                <>
                  <span style={{ visibility: profileHovered ? 'hidden' : 'visible' }}><RefreshCw size={13} strokeWidth={1.8} style={{ animation: 'spin 1s linear infinite' }} />{phase || 'Generating...'}</span>
                  <span style={{ visibility: profileHovered ? 'visible' : 'hidden' }}><RefreshCw size={13} strokeWidth={1.8} />Stop</span>
                </>
              ) : (
                <><RefreshCw size={13} strokeWidth={1.8} />Generate Profile</>
              )}
            </Button>
            {profile?.fullProfile && (
              <Button variant="secondary" onClick={() => setShowFullProfile(!showFullProfile)}>
                {showFullProfile ? 'Dashboard' : 'View Full Profile'}
              </Button>
            )}
          </>
        )}
      </MainHeader>
      <div className="flex-1 overflow-y-auto" style={{ padding: generating && !profile ? 0 : '36px 44px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {(!profile || generating) && !showFullProfile ? (
          <>
            <LeafCatcherGame />
            {generating && (
              <div style={{ position: 'absolute', top: 36, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 760, padding: '0 44px', zIndex: 1 }}>
                <div style={{
                  background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
                  borderRadius: 'var(--radius-md)', padding: '16px 20px',
                  border: '1px solid var(--stone)',
                }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginBottom: 8 }}>
                    {phase}
                  </div>
                  {progress.total > 0 && (
                    <ProgressBar current={progress.current} total={progress.total} label={progress.title} />
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
        <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
          {showFullProfile && profile?.fullProfile ? (
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
              dangerouslySetInnerHTML={{ __html: marked(profile.fullProfile) as string }}
            />
          ) : (
            <>
              {/* Summary */}
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 500, color: 'var(--ink)', marginBottom: 16 }}>
                Summary
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-agent)',
                  fontSize: 15.5,
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
                {profile.summary}
              </div>

              {/* Wellbeing Metrics */}
              <ProfileSection title="Wellbeing Overview">
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))' }}>
                  <MetricCard label="Average Mood" value={profile.averageMood != null ? String(profile.averageMood.toFixed(1)) : '--'} />
                  <MetricCard label="Journaling Streak" value={profile.journalingStreak != null ? `${profile.journalingStreak}d` : '--'} />
                  <MetricCard label="Avg Entry Length" value={profile.avgEntryLength != null ? `${profile.avgEntryLength}w` : '--'} />
                  <MetricCard label="Reflection Depth" value={profile.reflectionDepth ?? '--'} />
                </div>

                {/* Emotional Distribution */}
                {profile.emotionalDistribution && profile.emotionalDistribution.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sage)', fontWeight: 600, marginBottom: 12 }}>
                      Emotional Distribution
                    </div>
                    <div className="flex flex-col gap-2">
                      {profile.emotionalDistribution.map((item: { label: string; percentage: number; color: string }) => (
                        <div key={item.label} className="flex items-center gap-3" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5 }}>
                          <span style={{ width: 90, color: 'var(--manuscript)', flexShrink: 0 }}>{item.label}</span>
                          <div style={{ flex: 1, height: 8, background: 'var(--warm-cream)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${item.percentage}%`, height: '100%', background: item.color, borderRadius: 4, transition: 'width 0.4s ease' }} />
                          </div>
                          <span style={{ width: 36, textAlign: 'right', color: 'var(--sage)', fontSize: 11 }}>{item.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ProfileSection>

              {/* Themes */}
              {profile.themes.length > 0 && (
                <ProfileSection title="Recurring Themes">
                  <div className="flex flex-wrap gap-2">
                    {profile.themes.map((theme, i) => (
                      <span
                        key={theme.theme}
                        style={{
                          fontFamily: 'var(--font-ui)',
                          fontSize: 12,
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
              {profile.strengths.length > 0 && (
                <ProfileSection title="Strengths">
                  <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0 }}>
                    {profile.strengths.map((s) => (
                      <li key={s} className="flex items-start gap-2" style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.6 }}>
                        <span style={{ color: 'var(--gentle-green)', marginTop: 2 }}>●</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </ProfileSection>
              )}

              {/* Framework Insights */}
              {profile.frameworkInsights.length > 0 && (
                <ProfileSection title="Therapeutic Observations">
                  <div className="flex flex-col gap-2.5">
                    {profile.cognitivePatterns.map((p) => (
                      <div
                        key={p.pattern}
                        style={{
                          fontFamily: 'var(--font-agent)',
                          fontSize: 13.5,
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

              {/* Growth Areas */}
              {profile.growthAreas.length > 0 && (
                <ProfileSection title="Growth Areas">
                  <ul className="flex flex-col gap-2" style={{ listStyle: 'none', padding: 0 }}>
                    {profile.growthAreas.map((g) => (
                      <li key={g} className="flex items-start gap-2" style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.6 }}>
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

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid var(--stone)' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 500, color: 'var(--ink)', marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function MetricCard({ label, value, trend }: { label: string; value: string; trend?: string }) {
  return (
    <div
      style={{
        background: 'var(--parchment)',
        border: '1px solid var(--stone)',
        borderRadius: 'var(--radius-sm)',
        padding: '16px 18px',
        transition: 'all var(--transition-gentle)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sage)', fontWeight: 600, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 25, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
        {value}
      </div>
      {trend && (
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, marginTop: 3, color: 'var(--gentle-green)' }}>
          {trend}
        </div>
      )}
    </div>
  )
}

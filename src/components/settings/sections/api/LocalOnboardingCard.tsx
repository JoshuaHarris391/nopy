import { ExternalLink, RefreshCw } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { hasFileSystem } from '../../../../services/fs'

interface LocalOnboardingCardProps {
  /**
   * Drives which copy + which CTA appears in the card body.
   * 'not-running' — server unreachable (most likely cause: not started)
   * 'no-model'    — server up but no model loaded
   * 'name-mismatch' — model loaded but its id ≠ settings.localModel
   */
  status: 'not-running' | 'no-model' | 'name-mismatch'
  /** Loaded models (if any) so we can suggest a working name in name-mismatch. */
  loadedModels?: { id: string }[]
  /** Refresh trigger — re-runs the probe so the user can verify their fix. */
  onRefresh: () => void
  refreshing?: boolean
}

const LM_STUDIO_URL = 'https://lmstudio.ai/'

/**
 * Onboarding card shown when the local provider isn't ready. Renders
 * step-by-step instructions tailored to the failure, a "Download LM Studio"
 * link (opens the system browser via tauri-plugin-opener), and a Refresh
 * button so the user can verify their fix without leaving Settings.
 *
 * Visual: profile-blockquote pattern (left-border accent, warm-cream
 * background) per the existing design system. No new card primitive — this
 * is the only consumer of the pattern in settings.
 */
export function LocalOnboardingCard({ status, loadedModels = [], onRefresh, refreshing }: LocalOnboardingCardProps) {
  const handleDownload = async () => {
    if (!hasFileSystem()) {
      // Web build (Vite preview without Tauri): fall back to plain navigation.
      window.open(LM_STUDIO_URL, '_blank', 'noopener,noreferrer')
      return
    }
    try {
      await openUrl(LM_STUDIO_URL)
    } catch (e) {
      console.error('[LocalOnboardingCard] openUrl failed:', e)
      window.open(LM_STUDIO_URL, '_blank', 'noopener,noreferrer')
    }
  }

  const copy = COPY[status]

  return (
    <div
      style={{
        borderLeft: `3px solid ${status === 'not-running' ? 'var(--soft-coral)' : 'var(--amber)'}`,
        background: 'var(--warm-cream)',
        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
        padding: '14px 18px',
        margin: '12px 0 16px',
      }}
    >
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>
        {copy.title}
      </div>
      <ol style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--manuscript)', lineHeight: 1.6, margin: '6px 0 12px 18px', padding: 0 }}>
        {copy.steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>

      {status === 'name-mismatch' && loadedModels.length > 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--bark)', margin: '0 0 10px', padding: '6px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--radius-sm)' }}>
          Loaded: {loadedModels.map((m) => m.id).join(', ')}
        </div>
      )}

      <div className="flex" style={{ gap: 8 }}>
        {status === 'not-running' && (
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 cursor-pointer"
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 12px',
              border: '1px solid var(--bark)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bark)', color: '#fff',
              transition: 'all var(--transition-gentle)',
            }}
          >
            <ExternalLink size={12} strokeWidth={1.8} />
            Download LM Studio
          </button>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 cursor-pointer"
          style={{
            fontFamily: 'var(--font-ui)', fontSize: 12, padding: '6px 12px',
            border: '1px solid var(--stone)',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent', color: 'var(--ink)',
            transition: 'all var(--transition-gentle)',
            opacity: refreshing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={12} strokeWidth={1.8} />
          {refreshing ? 'Checking…' : 'Check again'}
        </button>
      </div>
    </div>
  )
}

const COPY: Record<LocalOnboardingCardProps['status'], { title: string; steps: string[] }> = {
  'not-running': {
    title: "Local AI isn't running",
    steps: [
      'Install LM Studio if you haven\'t already (button below).',
      'Open LM Studio and switch to the Developer tab.',
      'Click "Start Server". The status here will turn amber, then green once you load a model.',
    ],
  },
  'no-model': {
    title: 'LM Studio is running, but no model is loaded',
    steps: [
      'In LM Studio, search for a model — Gemma 4 E4B (Q4_K_M) is a good 16 GB default.',
      'Click Download, then Load.',
      'Come back here and click "Check again".',
    ],
  },
  'name-mismatch': {
    title: "The model in Settings isn't loaded in LM Studio",
    steps: [
      'Either load that model in LM Studio,',
      'or copy one of the loaded model ids below into the Model name field.',
    ],
  },
}

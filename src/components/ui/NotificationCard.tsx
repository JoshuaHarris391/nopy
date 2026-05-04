import { X } from 'lucide-react'
import { ProgressBar } from './ProgressBar'

export type NotificationAccent = 'neutral' | 'error' | 'success'

interface NotificationCardProps {
  title: string
  /** Optional secondary line. Used for profile "phase" text and error bodies. */
  description?: string
  /** Renders an inline `<ProgressBar />` when provided. */
  progress?: { current: number; total: number; label?: string }
  /**
   * Left-border accent. `neutral` (default) keeps the existing indexing /
   * profile-gen card look — no extra border. `error` adds a soft-coral
   * left bar; `success` adds a gentle-green one. Mirrors the
   * `LocalOnboardingCard` blockquote pattern.
   */
  accent?: NotificationAccent
  /** When provided, renders a small × close button in the top-right. */
  onDismiss?: () => void
}

const ACCENT_COLOR: Record<NotificationAccent, string | null> = {
  neutral: null,
  error: 'var(--soft-coral)',
  success: 'var(--gentle-green)',
}

/**
 * Reusable card for the bottom-right notification stack rendered by
 * `AppShell`. Replaces the two near-identical inline divs that used to
 * live in AppShell.tsx for indexing + profile generation, and adds the
 * accent variants used by chat-error notifications. Same parchment +
 * stone visual language as before — neutral accent renders identically
 * to the old inline cards.
 */
export function NotificationCard({ title, description, progress, accent = 'neutral', onDismiss }: NotificationCardProps) {
  const accentColor = ACCENT_COLOR[accent]
  return (
    <div
      role="status"
      style={{
        background: 'var(--parchment)',
        border: '1px solid var(--stone)',
        borderLeft: accentColor ? `3px solid ${accentColor}` : '1px solid var(--stone)',
        borderRadius: 'var(--radius-sm)',
        padding: '14px 18px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        minWidth: 280,
        maxWidth: 340,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: description || progress ? 8 : 0 }}>
        <div style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
          {title}
        </div>
        {onDismiss && (
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={onDismiss}
            style={{
              background: 'none', border: 'none', padding: 2, cursor: 'pointer',
              color: 'var(--sage)', display: 'inline-flex', alignItems: 'center',
              flex: '0 0 auto',
            }}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
      {description && (
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', marginBottom: progress ? 8 : 0, lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      {progress && (
        <ProgressBar current={progress.current} total={progress.total} label={progress.label} />
      )}
    </div>
  )
}

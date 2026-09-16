import { AlertTriangle, Repeat, Zap, Compass } from 'lucide-react'
import type { JournalEntry } from '../../types/journal'
import { hasStructuredIndex, isStaleIndex } from '../../services/entryRecords'

const pill: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 11, padding: '1px 6px', borderRadius: 10,
  whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3, lineHeight: 1.5,
}

const SAFETY_STYLE: Record<'monitor' | 'concern', React.CSSProperties> = {
  monitor: { background: 'rgba(212, 160, 60, 0.18)', color: '#8a5a12', border: '1px solid rgba(212, 160, 60, 0.5)' },
  concern: { background: 'rgba(196, 72, 60, 0.16)', color: '#8f2a20', border: '1px solid rgba(196, 72, 60, 0.5)' },
}

/**
 * The at-a-glance markers for one entry's structured index: safety first,
 * then the strongest emotion, who was there, recurring phrases, and dots
 * for a focal event or a prediction. Renders nothing for unindexed entries
 * and a single "legacy" pill for entries indexed with the old shape.
 */
export function InsightMarkers({ entry }: { entry: JournalEntry }) {
  if (!entry.indexed) return null
  if (!hasStructuredIndex(entry)) {
    return isStaleIndex(entry)
      ? <span data-testid="marker-legacy" style={{ ...pill, background: 'var(--warm-cream)', color: 'var(--sage)', border: '1px solid rgba(212, 201, 184, 0.5)' }} title="Indexed with an older format">legacy</span>
      : null
  }
  const ins = entry.insight
  const top = [...ins.emotions].sort((a, b) => b.intensity - a.intensity)[0]
  const names = ins.people.map((p) => p.name)
  const recurring = ins.quotes.filter((q) => q.matchesRecent).length

  return (
    <div className="flex flex-wrap items-center gap-1">
      {ins.safety.flag !== 'none' && (
        <span data-testid="marker-safety" style={{ ...pill, ...SAFETY_STYLE[ins.safety.flag] }} title={ins.safety.evidence ?? undefined}>
          <AlertTriangle size={11} strokeWidth={2} />{ins.safety.flag}
        </span>
      )}
      {top && (
        <span data-testid="marker-emotion" style={{ ...pill, background: 'var(--warm-cream)', color: 'var(--bark)', border: '1px solid rgba(212, 201, 184, 0.5)' }}>
          {top.label} {top.intensity}
        </span>
      )}
      {names.length > 0 && (
        <span data-testid="marker-people" style={{ ...pill, color: 'var(--manuscript)', opacity: 0.8 }} title={names.join(', ')}>
          {names.slice(0, 2).join(', ')}{names.length > 2 ? ` +${names.length - 2}` : ''}
        </span>
      )}
      {recurring > 0 && (
        <span data-testid="marker-recurring" style={{ ...pill, color: 'var(--sage)' }} title={`${recurring} recurring phrase${recurring === 1 ? '' : 's'}`}>
          <Repeat size={11} strokeWidth={2} />{recurring}
        </span>
      )}
      {ins.focalEvent && (
        <span data-testid="marker-focal" style={{ ...pill, color: 'var(--sage)' }} title="Focal event"><Zap size={11} strokeWidth={2} /></span>
      )}
      {ins.prediction && (
        <span data-testid="marker-prediction" style={{ ...pill, color: 'var(--sage)' }} title="Prediction"><Compass size={11} strokeWidth={2} /></span>
      )}
    </div>
  )
}

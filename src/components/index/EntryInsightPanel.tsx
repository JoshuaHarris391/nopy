import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Code, Copy, Check } from 'lucide-react'
import type { JournalEntry } from '../../types/journal'
import { STATE_KEYS } from '../../schemas/journal'
import { hasStructuredIndex, isStaleIndex } from '../../services/entryRecords'

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
  color: 'var(--sage)', fontWeight: 600, marginBottom: 4,
}
const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--manuscript)', lineHeight: 1.65,
}
const chip: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 10.5, padding: '0 6px', borderRadius: 8,
  background: 'var(--warm-cream)', border: '1px solid rgba(212, 201, 184, 0.5)', color: 'var(--bark)', marginLeft: 6,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={labelStyle}>{title}</div>
      <div style={bodyStyle}>{children}</div>
    </div>
  )
}

const STATE_LABEL: Record<(typeof STATE_KEYS)[number], string> = {
  anxiety: 'anxiety', irritability: 'irritability', sadness: 'sadness', calm: 'calm',
  agency: 'agency', connection: 'connection', meaning: 'meaning',
}

/**
 * The expanded row under an index entry: every section of the structured
 * record, each omitted when empty, plus a toggle that exposes the raw JSON
 * for anyone who wants to see exactly what the instrument stored.
 */
export function EntryInsightPanel({ entry }: { entry: JournalEntry }) {
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)

  const raw = JSON.stringify({
    id: entry.id, createdAt: entry.createdAt, sourceFilename: entry.sourceFilename ?? null,
    mood: entry.mood, moodSource: entry.moodSource ?? null, tags: entry.tags, summary: entry.summary,
    indexVersion: entry.indexVersion ?? (entry.indexed ? 1 : 0), indexModel: entry.indexModel ?? null,
    insight: entry.insight ?? null,
  }, null, 2)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  }

  const structured = hasStructuredIndex(entry)
  const ins = structured ? entry.insight : null

  return (
    <div style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 16 }}>
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 sm:hidden">
          {entry.tags.map((tag) => (
            <span key={tag} style={{ fontSize: 12, padding: '1px 6px', background: 'var(--warm-cream)', border: '1px solid rgba(212, 201, 184, 0.5)', borderRadius: 10, color: 'var(--bark)', whiteSpace: 'nowrap' }}>{tag}</span>
          ))}
        </div>
      )}

      <Section title="Summary">{entry.summary || '—'}</Section>

      {!structured && entry.indexed && isStaleIndex(entry) && (
        <div data-testid="legacy-note" style={{ ...bodyStyle, fontSize: 12.5, color: 'var(--sage)', marginBottom: 14 }}>
          Indexed with an older format. <Link to="/settings" style={{ color: 'var(--bark)', textDecoration: 'underline' }}>Re-index</Link> to see full detail.
        </div>
      )}

      {ins && (
        <>
          <Section title="States">
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>
              {STATE_KEYS.map((k) => {
                const s = ins.states[k]
                const v = s.value != null && (s.confidence ?? 0) >= 0.5 ? s.value : '–'
                return <span key={k} title={s.evidence ?? undefined} style={{ marginRight: 12 }}>{STATE_LABEL[k]} <strong>{v}</strong></span>
              })}
            </span>
          </Section>
          {ins.emotions.length > 0 && (
            <Section title="Emotions">{ins.emotions.map((e) => `${e.label} ${e.intensity}`).join(' · ')}</Section>
          )}
          {ins.people.length > 0 && (
            <Section title="People">
              {ins.people.map((p, i) => (
                <div key={i}>
                  <strong>{p.name}</strong>
                  {p.role !== 'unknown' && <span style={chip}>{p.role}</span>}
                  <span style={chip}>{p.interaction}{p.feltAfter ? ` → ${p.feltAfter}` : ''}</span>
                  {p.note && <span> — {p.note}</span>}
                </div>
              ))}
            </Section>
          )}
          {ins.quotes.length > 0 && (
            <Section title="Quotes">
              {ins.quotes.map((q, i) => (
                <blockquote key={i} style={{ borderLeft: '3px solid var(--amber)', margin: '4px 0', padding: '2px 10px', fontStyle: 'italic' }}>
                  "{q.text}"
                  <span style={{ ...chip, fontStyle: 'normal' }}>{q.category}</span>
                  {q.matchesRecent && <span style={{ ...chip, fontStyle: 'normal' }}>recurring</span>}
                </blockquote>
              ))}
            </Section>
          )}
          {ins.focalEvent && (
            <Section title="Focal event">
              {[ins.focalEvent.trigger, ins.focalEvent.interpretation && `"${ins.focalEvent.interpretation}"`, ins.focalEvent.emotionBody, ins.focalEvent.behaviour, ins.focalEvent.outcome].filter(Boolean).join(' → ')}
              {ins.focalEvent.alternativeView && <div style={{ color: 'var(--sage)' }}>Alternative view: {ins.focalEvent.alternativeView}</div>}
            </Section>
          )}
          {ins.revelations.length > 0 && (
            <Section title="Realised">{ins.revelations.map((r, i) => <div key={i}>{r}</div>)}</Section>
          )}
          {ins.prediction && (
            <Section title="Prediction">{ins.prediction.text}{ins.prediction.targetDate ? ` (by ${ins.prediction.targetDate})` : ''}</Section>
          )}
          {ins.coping.length > 0 && (
            <Section title="Coping">
              {ins.coping.map((c) => `${c.strategy}${c.effect != null ? ` (${c.effect > 0 ? '+' : ''}${c.effect})` : ''}`).join(' · ')}
            </Section>
          )}
          {(ins.body.sleepHours != null || ins.body.sleepQuality != null || ins.body.movement || ins.body.substances.length > 0 || ins.body.symptoms.length > 0 || ins.body.notes) && (
            <Section title="Body">
              {[
                ins.body.sleepHours != null ? `slept ${ins.body.sleepHours}h` : null,
                ins.body.sleepQuality != null ? `sleep quality ${ins.body.sleepQuality}/10` : null,
                ins.body.movement ? `movement ${ins.body.movement}` : null,
                ...ins.body.substances.map((s) => `${s.type}${s.quantity ? ` ${s.quantity}` : ''}`),
                ins.body.symptoms.length ? ins.body.symptoms.join(', ') : null,
                ins.body.notes,
              ].filter(Boolean).join(' · ')}
            </Section>
          )}
          {ins.safety.flag !== 'none' && (
            <Section title="Safety">
              <strong>{ins.safety.flag}</strong>{ins.safety.evidence ? ` — "${ins.safety.evidence}"` : ''}
            </Section>
          )}
          {ins.observations.length > 0 && (
            <Section title="Observations">
              {ins.observations.map((o, i) => (
                <div key={i}>{o.text}<span style={chip}>{o.kind}</span><span style={chip}>{o.basis}</span></div>
              ))}
            </Section>
          )}
          {ins.unclassified.length > 0 && (
            <Section title="Unclassified terms">{ins.unclassified.join(', ')}</Section>
          )}
        </>
      )}

      {entry.indexed && (
        <div style={{ marginTop: 6 }}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              style={{ background: 'none', border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: '4px 10px', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--bark)', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Code size={12} strokeWidth={2} />{showRaw ? 'Hide raw index' : 'View raw index'}
            </button>
            {showRaw && (
              <button
                type="button"
                onClick={copy}
                style={{ background: 'none', border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: '4px 10px', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--bark)', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={2} />}{copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          {showRaw && (
            <pre
              data-testid="raw-index"
              style={{ marginTop: 8, maxHeight: 360, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5, background: 'var(--warm-cream)', border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)', padding: 10, color: 'var(--ink)' }}
            >
              {raw}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

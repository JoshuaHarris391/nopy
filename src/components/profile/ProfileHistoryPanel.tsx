import { useState } from 'react'
import { ChevronDown, Trash2, Check } from 'lucide-react'
import { format } from 'date-fns'
import { useProfileStore } from '../../stores/profileStore'
import { describeScope } from '../../services/entryRecords'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import type { ProfileVersionMeta } from '../../types/profile'

const pill: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 10.5, padding: '1px 7px', borderRadius: 10,
  background: 'var(--warm-cream)', border: '1px solid rgba(212, 201, 184, 0.6)', color: 'var(--bark)', whiteSpace: 'nowrap',
}

function versionLabel(v: ProfileVersionMeta, all: ProfileVersionMeta[]): string {
  if (!v.isRevision) return 'Full write'
  const base = v.basedOn ? all.find((x) => x.id === v.basedOn) : null
  return base ? `Revision of ${format(new Date(base.createdAt), 'd MMM yyyy')}` : 'Revision'
}

/**
 * Every generated profile, newest first. The selected version is the one the
 * Profile page shows and the one Context and Chat inject; any other can be
 * put in use, or deleted after a confirmation.
 */
export function ProfileHistoryPanel() {
  const versions = useProfileStore((s) => s.versions)
  const selectedId = useProfileStore((s) => s.profile?.id ?? null)
  const generating = useProfileStore((s) => s.generating)
  const selectVersion = useProfileStore((s) => s.selectVersion)
  const deleteVersion = useProfileStore((s) => s.deleteVersion)
  const [open, setOpen] = useState(versions.length > 1)
  const [pendingDelete, setPendingDelete] = useState<ProfileVersionMeta | null>(null)

  if (versions.length === 0) return null

  return (
    <div data-testid="profile-history" style={{ maxWidth: 760, margin: '0 auto 24px', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--warm-cream)', border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
          padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)',
        }}
      >
        <span>Generated profiles ({versions.length})</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--sage)', fontSize: 12 }}>
          The selected profile feeds Context and Chat
          <ChevronDown size={16} style={{ transition: 'transform 200ms ease-out', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </span>
      </button>

      {open && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--stone)', borderTop: 'none', borderRadius: '0 0 var(--radius-sm) var(--radius-sm)' }}>
          {versions.map((v) => {
            const selected = v.id === selectedId
            return (
              <li
                key={v.id}
                data-testid="history-row"
                data-selected={selected ? 'true' : 'false'}
                className="flex flex-wrap items-center gap-2"
                style={{
                  padding: '10px 12px', borderTop: '1px solid rgba(212, 201, 184, 0.35)',
                  background: selected ? 'rgba(91, 127, 94, 0.08)' : 'transparent',
                  fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--manuscript)',
                }}
              >
                <span style={{ fontWeight: 500, color: 'var(--ink)', minWidth: 150 }}>
                  {format(new Date(v.createdAt), 'd MMM yyyy, HH:mm')}
                </span>
                <span style={pill}>{versionLabel(v, versions)}</span>
                <span style={pill}>{v.entriesAnalyzed} {v.entriesAnalyzed === 1 ? 'entry' : 'entries'}</span>
                <span style={pill}>{describeScope(v.scope)}</span>
                {v.hasFullProfile && <span style={pill}>full profile</span>}
                <span style={{ flex: 1 }} />
                {selected ? (
                  <span data-testid="history-in-use" style={{ ...pill, background: 'var(--forest)', color: 'white', border: '1px solid var(--forest)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Check size={11} strokeWidth={2.5} /> In use
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      data-testid="history-use"
                      disabled={generating}
                      onClick={() => selectVersion(v.id)}
                      style={{ ...pill, cursor: generating ? 'not-allowed' : 'pointer', padding: '3px 10px', fontSize: 12 }}
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      data-testid="history-delete"
                      aria-label={`Delete profile from ${format(new Date(v.createdAt), 'd MMM yyyy')}`}
                      disabled={generating}
                      onClick={() => setPendingDelete(v)}
                      style={{ background: 'none', border: 'none', cursor: generating ? 'not-allowed' : 'pointer', color: 'var(--sage)', padding: 4, display: 'inline-flex' }}
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this profile?"
        body={pendingDelete ? `The profile generated on ${format(new Date(pendingDelete.createdAt), 'd MMM yyyy, HH:mm')} will be removed permanently.` : ''}
        onConfirm={() => { if (pendingDelete) deleteVersion(pendingDelete.id); setPendingDelete(null) }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

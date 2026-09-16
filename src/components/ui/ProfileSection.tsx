/** A titled, bottom-bordered block used by the Profile and Insights pages. */
export function ProfileSection({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid var(--stone)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 500, color: 'var(--ink)' }}>
          {title}
        </div>
        {aside}
      </div>
      {children}
    </div>
  )
}

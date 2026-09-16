/** One headline number with an uppercase label; used in card grids. */
export function MetricCard({ label, value, trend, testId }: { label: string; value: string; trend?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
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
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, marginTop: 3, color: 'var(--sage)' }}>
          {trend}
        </div>
      )}
    </div>
  )
}

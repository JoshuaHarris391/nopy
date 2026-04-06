interface ProgressBarProps {
  current: number
  total: number
  label?: string
}

export function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="flex flex-col gap-2" style={{ maxWidth: 400 }}>
      {label && (
        <div className="flex justify-between" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)' }}>
          <span>{label}</span>
          <span>{current}/{total}</span>
        </div>
      )}
      <div style={{ height: 6, background: 'var(--warm-cream)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(212, 201, 184, 0.4)' }}>
        <div
          style={{
            height: '100%',
            width: `${percentage}%`,
            background: 'var(--forest)',
            borderRadius: 3,
            transition: 'width 300ms ease-out',
          }}
        />
      </div>
    </div>
  )
}

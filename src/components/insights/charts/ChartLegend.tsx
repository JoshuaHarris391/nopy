export interface LegendItem {
  id: string
  label: string
  color: string
  /** 'hollow' draws a ring swatch (used for inferred moods). */
  shape?: 'filled' | 'hollow' | 'square'
}

interface ChartLegendProps {
  items: LegendItem[]
  hidden?: Set<string>
  /** When given, items are toggle buttons; otherwise a static key. */
  onToggle?: (id: string) => void
}

/** Legend row above a chart. With `onToggle`, each item is a pressed/unpressed button. */
export function ChartLegend({ items, hidden, onToggle }: ChartLegendProps) {
  return (
    <div className="flex flex-wrap items-center" style={{ gap: '4px 12px', marginBottom: 8 }}>
      {items.map((item) => {
        const off = hidden?.has(item.id) ?? false
        const swatch = (
          <span
            aria-hidden
            style={{
              width: 10, height: 10, borderRadius: item.shape === 'square' ? 2 : 5, display: 'inline-block',
              background: item.shape === 'hollow' ? 'transparent' : item.color,
              border: `2px solid ${item.color}`,
              opacity: off ? 0.35 : 1,
            }}
          />
        )
        const style: React.CSSProperties = {
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--manuscript)',
          textDecoration: off ? 'line-through' : 'none', opacity: off ? 0.6 : 1,
        }
        return onToggle ? (
          <button
            key={item.id}
            type="button"
            aria-pressed={!off}
            data-legend={item.id}
            onClick={() => onToggle(item.id)}
            style={{ ...style, background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer' }}
          >
            {swatch}{item.label}
          </button>
        ) : (
          <span key={item.id} data-legend={item.id} style={style}>{swatch}{item.label}</span>
        )
      })}
    </div>
  )
}

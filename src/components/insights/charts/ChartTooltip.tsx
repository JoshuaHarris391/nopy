import { CHART_W } from './ChartFrame'

/** The hover label: a dark rounded box above the mark, clamped inside the plot. */
export function ChartTooltip({ x, y, text, plotLeft = 40, plotRight = CHART_W - 16 }: { x: number; y: number; text: string; plotLeft?: number; plotRight?: number }) {
  const width = Math.max(96, Math.min(260, text.length * 6.4 + 20))
  const cx = Math.max(plotLeft + width / 2, Math.min(plotRight - width / 2, x))
  const top = Math.max(2, y - 42)
  return (
    <g data-testid="chart-tooltip" style={{ pointerEvents: 'none' }}>
      <rect x={cx - width / 2} y={top} width={width} height={28} rx={6} fill="var(--ink)" opacity={0.9} />
      <text x={cx} y={top + 18} textAnchor="middle" fill="var(--parchment)" fontSize={11.5} fontFamily="var(--font-ui)" fontWeight={500}>
        {text}
      </text>
    </g>
  )
}

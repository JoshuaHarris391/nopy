import type { ReactNode } from 'react'

/**
 * Shared SVG frame: fixed viewBox (responsive via width:100%), recessive
 * grid and axes, an optional empty state, and an accessible summary label.
 * No ResizeObserver or getBBox, so it renders identically in jsdom.
 */

export const CHART_W = 680
export const CHART_H = 260

export interface Scales {
  /** Fraction (0..1) of the plot width → x pixel. */
  xFrac: (frac: number) => number
  /** Value in `domain` → y pixel. */
  y: (v: number) => number
  plot: { left: number; top: number; width: number; height: number; right: number; bottom: number }
}

export interface ChartFrameProps {
  /** data-testid="chart-<id>" */
  id: string
  /** Y domain [min, max]. */
  domain: [number, number]
  yTicks?: number[]
  yFormat?: (v: number) => string
  xTicks?: Array<{ label: string; frac: number }>
  /** Data-derived one-sentence summary for screen readers. */
  ariaLabel: string
  /** When set, renders this text centred instead of children. */
  empty?: string | null
  height?: number
  /** Wider left gutter for row labels (heatmap). */
  leftPad?: number
  children: (s: Scales) => ReactNode
}

const AXIS_FONT = { fill: 'var(--sage)', fontSize: 10, fontFamily: 'var(--font-ui)' } as const

export function ChartFrame({ id, domain, yTicks, yFormat, xTicks = [], ariaLabel, empty, height = CHART_H, leftPad = 40, children }: ChartFrameProps) {
  const pad = { top: 16, right: 16, bottom: 28, left: leftPad }
  const plot = { left: pad.left, top: pad.top, width: CHART_W - pad.left - pad.right, height: height - pad.top - pad.bottom, right: CHART_W - pad.right, bottom: height - pad.bottom }
  const [min, max] = domain
  const span = max - min || 1
  const scales: Scales = {
    xFrac: (f) => plot.left + Math.min(1, Math.max(0, f)) * plot.width,
    y: (v) => plot.top + plot.height - ((v - min) / span) * plot.height,
    plot,
  }
  const ticks = yTicks ?? defaultTicks(min, max)
  const fmt = yFormat ?? ((v: number) => String(v))

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      data-testid={`chart-${id}`}
      viewBox={`0 0 ${CHART_W} ${height}`}
      style={{ width: '100%', height: 'auto', overflow: 'visible', display: 'block' }}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={plot.left} y1={scales.y(t)} x2={plot.right} y2={scales.y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
          <text x={plot.left - 8} y={scales.y(t) + 3.5} textAnchor="end" {...AXIS_FONT}>{fmt(t)}</text>
        </g>
      ))}
      <line x1={plot.left} y1={plot.bottom} x2={plot.right} y2={plot.bottom} stroke="var(--stone)" strokeWidth={1} />
      {xTicks.map((t, i) => (
        <text key={i} x={scales.xFrac(t.frac)} y={height - 6} textAnchor="middle" {...AXIS_FONT}>{t.label}</text>
      ))}
      {empty ? (
        <text data-testid="chart-empty" x={plot.left + plot.width / 2} y={plot.top + plot.height / 2} textAnchor="middle" fill="var(--sage)" fontSize={13} fontFamily="var(--font-ui)">
          {empty}
        </text>
      ) : children(scales)}
    </svg>
  )
}

function defaultTicks(min: number, max: number): number[] {
  const span = max - min
  const step = span <= 12 ? (span <= 6 ? 1 : 2) : Math.ceil(span / 6)
  const out: number[] = []
  for (let v = min; v <= max; v += step) out.push(v)
  if (out[out.length - 1] !== max) out.push(max)
  return out
}

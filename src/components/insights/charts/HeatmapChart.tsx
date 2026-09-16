import { useState } from 'react'
import { ChartTooltip } from './ChartTooltip'
import { CHART_W } from './ChartFrame'
import type { CategorySeriesResult } from '../../../services/insightSeries'
import { heatRampColor } from '../../../utils/chartColors'

export interface HeatmapChartProps {
  id: string
  data: CategorySeriesResult
  labels?: Record<string, string>
  emptyText?: string
  ariaLabel: string
}

const ROW_H = 26
const LEFT = 110
const PAD = { top: 8, right: 16, bottom: 52 }

/**
 * Rows = categories, columns = buckets, cell opacity = count / max. Stays
 * legible when most buckets hold one or two entries, where a stacked bar
 * would collapse into single-colour columns.
 */
export function HeatmapChart({ id, data, labels = {}, emptyText = 'Not enough indexed entries in this period', ariaLabel }: HeatmapChartProps) {
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null)
  const { categories, buckets } = data
  const max = Math.max(0, ...buckets.flatMap((b) => categories.map((c) => b.counts[c] ?? 0)))
  const rows = Math.max(1, categories.length)
  const height = PAD.top + rows * ROW_H + PAD.bottom
  const cols = buckets.length || 1
  const plotW = CHART_W - LEFT - PAD.right
  const cellW = plotW / cols
  const name = (c: string) => labels[c] ?? c.replace(/_/g, ' ')
  const tickEvery = cols <= 8 ? 1 : Math.ceil(cols / 8)

  return (
    <svg role="img" aria-label={ariaLabel} data-testid={`chart-${id}`} viewBox={`0 0 ${CHART_W} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible', display: 'block' }}>
      {max === 0 ? (
        <text data-testid="chart-empty" x={LEFT + plotW / 2} y={height / 2} textAnchor="middle" fill="var(--sage)" fontSize={13} fontFamily="var(--font-ui)">{emptyText}</text>
      ) : (
        <>
          {categories.map((c, ri) => (
            <g key={c} data-series={c}>
              <text x={LEFT - 8} y={PAD.top + ri * ROW_H + ROW_H / 2 + 3.5} textAnchor="end" fill="var(--manuscript)" fontSize={11} fontFamily="var(--font-ui)">{name(c)}</text>
              {buckets.map((b, ci) => {
                const count = b.counts[c] ?? 0
                const isHovered = hovered?.row === ri && hovered.col === ci
                return (
                  <rect
                    key={b.key}
                    data-cell data-bucket={b.key} data-category={c} data-count={count}
                    x={LEFT + ci * cellW + 1} y={PAD.top + ri * ROW_H + 1}
                    width={Math.max(1, cellW - 2)} height={ROW_H - 2} rx={3}
                    fill={count === 0 ? 'var(--chart-grid)' : heatRampColor(max <= 1 ? 1 : (count - 1) / (max - 1))}
                    opacity={count === 0 ? 0.5 : 1}
                    stroke={isHovered ? 'var(--ink)' : 'none'}
                    strokeWidth={1.5}
                    onMouseEnter={() => setHovered({ row: ri, col: ci })}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>{`${b.label} · ${name(c)}: ${count}`}</title>
                  </rect>
                )
              })}
            </g>
          ))}
          {/* Ramp legend on its own row beneath the period labels */}
          <g data-testid="heat-ramp" transform={`translate(${CHART_W - PAD.right - 130}, ${height - 8})`}>
            <text x={-6} y={4} textAnchor="end" fill="var(--sage)" fontSize={10} fontFamily="var(--font-ui)">fewer</text>
            {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
              <rect key={t} x={i * 18} y={-5} width={16} height={9} rx={2} fill={heatRampColor(t)} />
            ))}
            <text x={5 * 18 + 4} y={4} fill="var(--sage)" fontSize={10} fontFamily="var(--font-ui)">more</text>
          </g>
          {buckets.map((b, ci) => (ci % tickEvery === 0 ? (
            <text key={b.key} x={LEFT + ci * cellW + cellW / 2} y={height - 30} textAnchor="middle" fill="var(--sage)" fontSize={10} fontFamily="var(--font-ui)">{b.label}</text>
          ) : null))}
          {hovered && (() => {
            const b = buckets[hovered.col]
            const c = categories[hovered.row]
            return (
              <ChartTooltip
                x={LEFT + hovered.col * cellW + cellW / 2}
                y={PAD.top + hovered.row * ROW_H + 4}
                text={`${b.label} · ${name(c)}: ${b.counts[c] ?? 0}`}
                plotLeft={LEFT}
                plotRight={CHART_W - PAD.right}
              />
            )
          })()}
        </>
      )}
    </svg>
  )
}

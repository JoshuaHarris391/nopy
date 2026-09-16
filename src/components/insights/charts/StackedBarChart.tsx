import { useState } from 'react'
import { ChartFrame } from './ChartFrame'
import { ChartTooltip } from './ChartTooltip'
import { ChartLegend } from './ChartLegend'
import type { CategorySeriesResult } from '../../../services/insightSeries'

export interface StackedBarChartProps {
  id: string
  data: CategorySeriesResult
  /** `count` stacks raw counts; `percent` normalises each bucket to 100. */
  mode: 'count' | 'percent'
  colors: Record<string, string>
  /** Display names, e.g. other_recreational → other substance. */
  labels?: Record<string, string>
  legend?: boolean
  height?: number
  emptyText?: string
  ariaLabel: string
}

/**
 * One stacked column per bucket. Segments are separated by a 2px surface
 * gap and the topmost segment has rounded ends; columns are hoverable per
 * segment.
 */
export function StackedBarChart({ id, data, mode, colors, labels = {}, legend = true, height, emptyText = 'Not enough indexed entries in this period', ariaLabel }: StackedBarChartProps) {
  const [hovered, setHovered] = useState<{ bucket: number; category: string } | null>(null)
  const { categories, buckets } = data
  const hasData = buckets.some((b) => b.total > 0)
  const maxTotal = Math.max(1, ...buckets.map((b) => b.total))
  const domain: [number, number] = mode === 'percent' ? [0, 100] : [0, maxTotal]
  const n = buckets.length || 1
  const xTicks = buckets.map((b, i) => ({ label: b.label, frac: (i + 0.5) / n }))
    .filter((_, i) => n <= 8 || i % Math.ceil(n / 8) === 0)
  const name = (c: string) => labels[c] ?? c.replace(/_/g, ' ')

  return (
    <div>
      {legend && categories.length > 0 && (
        <ChartLegend items={categories.map((c) => ({ id: c, label: name(c), color: colors[c], shape: 'square' }))} />
      )}
      <ChartFrame
        id={id}
        domain={domain}
        yFormat={mode === 'percent' ? (v) => `${v}%` : undefined}
        xTicks={xTicks}
        ariaLabel={ariaLabel}
        empty={hasData ? null : emptyText}
        height={height}
      >
        {(sc) => {
          const band = sc.plot.width / n
          const barW = Math.max(6, Math.min(40, band * 0.6))
          return (
            <>
              {buckets.map((b, bi) => {
                if (b.total === 0) return null
                const x = sc.xFrac((bi + 0.5) / n) - barW / 2
                let acc = 0
                const segments = categories.filter((c) => (b.counts[c] ?? 0) > 0)
                return (
                  <g key={b.key} data-bucket={b.key}>
                    {segments.map((c, si) => {
                      const raw = b.counts[c] ?? 0
                      const value = mode === 'percent' ? (raw / b.total) * 100 : raw
                      const y0 = sc.y(acc)
                      const y1 = sc.y(acc + value)
                      acc += value
                      const h = Math.max(0, y0 - y1 - 2) // 2px surface gap between segments
                      const isTop = si === segments.length - 1
                      const isHovered = hovered?.bucket === bi && hovered.category === c
                      return (
                        <rect
                          key={c}
                          data-category={c} data-count={raw}
                          x={x} y={y1 + 1} width={barW} height={h}
                          rx={isTop ? 3 : 0}
                          fill={colors[c]}
                          opacity={hovered && !isHovered ? 0.55 : 1}
                          onMouseEnter={() => setHovered({ bucket: bi, category: c })}
                          onMouseLeave={() => setHovered(null)}
                          style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                        >
                          <title>{`${b.label} · ${name(c)}: ${raw}${mode === 'percent' ? ` (${Math.round((raw / b.total) * 100)}%)` : ''}`}</title>
                        </rect>
                      )
                    })}
                  </g>
                )
              })}
              {hovered && (() => {
                const b = buckets[hovered.bucket]
                const raw = b.counts[hovered.category] ?? 0
                const text = `${b.label} · ${name(hovered.category)}: ${raw}${mode === 'percent' ? ` (${Math.round((raw / b.total) * 100)}%)` : ''}`
                return <ChartTooltip x={sc.xFrac((hovered.bucket + 0.5) / n)} y={sc.plot.top + 30} text={text} plotLeft={sc.plot.left} plotRight={sc.plot.right} />
              })()}
            </>
          )
        }}
      </ChartFrame>
    </div>
  )
}

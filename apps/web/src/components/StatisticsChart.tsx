/** Renders dependency-free, responsive SVG charts for academic statistics. */

import { useId } from 'react'

export type StatisticsChartType = 'pie' | 'columns' | 'line' | 'bars' | 'area'
type PieLabelMode = 'total' | 'percentages'

export interface ChartDatum {
  label: string
  value: number
}

interface StatisticsChartProps {
  data: ChartDatum[]
  type: StatisticsChartType
  title: string
  valueLabel?: (value: number) => string
  pieLabelMode?: PieLabelMode
}

interface PieEntry extends ChartDatum {
  index: number
  percentage: number
}

interface PieSlice extends PieEntry {
  startAngle: number
  endAngle: number
}

const chartColors = [
  'var(--statistics-chart-1)',
  'var(--statistics-chart-2)',
  'var(--statistics-chart-3)',
  'var(--statistics-chart-4)',
  'var(--statistics-chart-5)',
  'var(--statistics-chart-6)',
]

const numericFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const percentageFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function compactLabel(value: string, maximum = 12): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value
}

function safeChartValue(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}

function formatChartValue(value: number, valueLabel?: StatisticsChartProps['valueLabel']): string {
  return valueLabel?.(value) ?? numericFormatter.format(value)
}

function formatPercentage(value: number): string {
  return `${percentageFormatter.format(value)}%`
}

function maximumValue(data: ChartDatum[]): number {
  return Math.max(1, ...data.map((item) => safeChartValue(item.value)))
}

function hasValues(data: ChartDatum[]): boolean {
  return data.some((item) => safeChartValue(item.value) > 0)
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function donutSlicePath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle)
  const outerEnd = polarPoint(cx, cy, outerRadius, endAngle)
  const innerEnd = polarPoint(cx, cy, innerRadius, endAngle)
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function pieEntries(data: ChartDatum[]): { entries: PieEntry[]; slices: PieSlice[]; total: number } {
  const normalized = data.map((item, index) => ({
    index,
    label: String(item.label || 'Sem rótulo'),
    value: safeChartValue(item.value),
  }))
  const total = normalized.reduce((sum, item) => sum + item.value, 0)
  const entries = normalized.map((item) => ({
    ...item,
    percentage: total > 0 ? (item.value / total) * 100 : 0,
  }))
  const positiveEntries = entries.filter((item) => item.value > 0)
  let angle = 0

  const slices = positiveEntries.map((item, index) => {
    const startAngle = angle
    // Closing the last sector at 360 avoids a floating-point seam.
    const endAngle = index === positiveEntries.length - 1 ? 360 : angle + (item.value / total) * 360
    angle = endAngle
    return { ...item, startAngle, endAngle }
  })

  return { entries, slices, total }
}

function ChartLegend({ data, valueLabel }: Pick<StatisticsChartProps, 'data' | 'valueLabel'>) {
  return (
    <ul className="statistics-chart-legend">
      {data.map((item, index) => (
        <li key={`${item.label}-${index}`}>
          <span aria-hidden="true" className="statistics-legend-color" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
          <span className="statistics-legend-label" title={item.label}>{item.label}</span>
          <strong>{formatChartValue(safeChartValue(item.value), valueLabel)}</strong>
        </li>
      ))}
    </ul>
  )
}

function PieLegend({ entries, valueLabel }: { entries: PieEntry[]; valueLabel?: StatisticsChartProps['valueLabel'] }) {
  return (
    <ul aria-label="Detalhamento dos setores" className="statistics-chart-legend statistics-pie-legend">
      {entries.map((item) => (
        <li key={`${item.label}-${item.index}`}>
          <span aria-hidden="true" className="statistics-legend-color" style={{ backgroundColor: chartColors[item.index % chartColors.length] }} />
          <span className="statistics-legend-label" title={item.label}>{item.label}</span>
          <span className="statistics-legend-metrics">
            <strong>{formatChartValue(item.value, valueLabel)}</strong>
            <small>{formatPercentage(item.percentage)}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

function PieChart({ data, title, valueLabel, pieLabelMode = 'total' }: Pick<StatisticsChartProps, 'data' | 'title' | 'valueLabel' | 'pieLabelMode'>) {
  const titleId = useId()
  const descriptionId = useId()
  const { entries, slices, total } = pieEntries(data)
  const summary = entries
    .map((item) => `${item.label}: ${formatChartValue(item.value, valueLabel)} (${formatPercentage(item.percentage)})`)
    .join('. ')
  const singleSlice = slices.length === 1
  const centerX = 140
  const centerY = 140
  const outerRadius = 104
  const innerRadius = 62
  const showSectorPercentages = pieLabelMode === 'percentages'
  const description = showSectorPercentages
    ? summary
    : `Total ${formatChartValue(total, valueLabel)}. ${summary}.`

  return (
    <figure className="statistics-pie-figure">
      <svg
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="statistics-chart-svg statistics-pie-chart"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox="0 0 280 280"
      >
        <title id={titleId}>{`${title}: gráfico de setores`}</title>
        <desc id={descriptionId}>{description}</desc>
        <g aria-hidden="true">
          {singleSlice ? (
            <>
              <circle cx={centerX} cy={centerY} fill={chartColors[slices[0].index % chartColors.length]} r={outerRadius} />
              <circle className="statistics-donut-hole" cx={centerX} cy={centerY} r={innerRadius} />
            </>
          ) : (
            slices.map((slice) => (
              <path
                d={donutSlicePath(centerX, centerY, outerRadius, innerRadius, slice.startAngle, slice.endAngle)}
                fill={chartColors[slice.index % chartColors.length]}
                key={`${slice.label}-${slice.index}`}
                stroke="var(--surface)"
                strokeWidth="3"
              />
            ))
          )}
        </g>
        {showSectorPercentages
          ? slices
            .filter((slice) => slice.percentage >= 8)
            .map((slice) => {
              const position = polarPoint(centerX, centerY, (outerRadius + innerRadius) / 2, (slice.startAngle + slice.endAngle) / 2)
              return (
                <text
                  aria-hidden="true"
                  className="statistics-pie-sector-label"
                  dominantBaseline="middle"
                  key={`percentage-${slice.label}-${slice.index}`}
                  textAnchor="middle"
                  x={position.x}
                  y={position.y}
                >
                  {formatPercentage(slice.percentage)}
                </text>
              )
            })
          : (
            <>
              <text aria-hidden="true" className="statistics-pie-total" textAnchor="middle" x={centerX} y={centerY - 8}>Total</text>
              <text aria-hidden="true" className="statistics-pie-value" textAnchor="middle" x={centerX} y={centerY + 21}>{formatChartValue(total, valueLabel)}</text>
            </>
          )}
      </svg>
      <figcaption className="statistics-pie-caption">
        <strong>{title}</strong>
        <span>Os valores e percentuais também estão listados abaixo.</span>
      </figcaption>
      <PieLegend entries={entries} valueLabel={valueLabel} />
    </figure>
  )
}

function VerticalChart({ data, title, area = false }: Pick<StatisticsChartProps, 'data' | 'title'> & { area?: boolean }) {
  const width = 540
  const height = 250
  const padding = { top: 20, right: 18, bottom: 46, left: 38 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const max = maximumValue(data)
  const baseline = padding.top + chartHeight
  const points = data.map((item, index) => {
    const x = data.length === 1
      ? padding.left + chartWidth / 2
      : padding.left + (chartWidth / (data.length - 1)) * index
    const y = baseline - (safeChartValue(item.value) / max) * chartHeight
    return { ...item, x, y }
  })
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaPoints = `${padding.left},${baseline} ${polyline} ${padding.left + chartWidth},${baseline}`

  return (
    <svg aria-label={title} className="statistics-chart-svg" role="img" viewBox={`0 0 ${width} ${height}`}>
      <title>{area ? `${title}: gráfico de área` : `${title}: gráfico de linhas`}</title>
      {[0, 0.5, 1].map((ratio) => {
        const y = padding.top + chartHeight * ratio
        const value = Math.round(max * (1 - ratio))
        return (
          <g key={ratio}>
            <line className="statistics-grid-line" x1={padding.left} x2={padding.left + chartWidth} y1={y} y2={y} />
            <text className="statistics-axis-label" textAnchor="end" x={padding.left - 8} y={y + 4}>{value}</text>
          </g>
        )
      })}
      {area && <polygon className="statistics-area-fill" points={areaPoints} />}
      <polyline className="statistics-line-path" fill="none" points={polyline} />
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle className="statistics-line-point" cx={point.x} cy={point.y} r="4" style={{ fill: chartColors[index % chartColors.length] }}>
            <title>{`${point.label}: ${formatChartValue(safeChartValue(point.value))}`}</title>
          </circle>
          <text className="statistics-axis-label" textAnchor="middle" x={point.x} y={baseline + 20}>{compactLabel(point.label)}</text>
        </g>
      ))}
    </svg>
  )
}

function ColumnsChart({ data, title }: Pick<StatisticsChartProps, 'data' | 'title'>) {
  const width = 540
  const height = 250
  const padding = { top: 20, right: 18, bottom: 46, left: 38 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const max = maximumValue(data)
  const baseline = padding.top + chartHeight
  const slotWidth = chartWidth / data.length
  const barWidth = Math.min(58, Math.max(16, slotWidth * 0.62))

  return (
    <svg aria-label={title} className="statistics-chart-svg" role="img" viewBox={`0 0 ${width} ${height}`}>
      <title>{`${title}: gráfico de colunas`}</title>
      {[0, 0.5, 1].map((ratio) => {
        const y = padding.top + chartHeight * ratio
        const value = Math.round(max * (1 - ratio))
        return (
          <g key={ratio}>
            <line className="statistics-grid-line" x1={padding.left} x2={padding.left + chartWidth} y1={y} y2={y} />
            <text className="statistics-axis-label" textAnchor="end" x={padding.left - 8} y={y + 4}>{value}</text>
          </g>
        )
      })}
      {data.map((item, index) => {
        const barHeight = (safeChartValue(item.value) / max) * chartHeight
        const x = padding.left + slotWidth * index + (slotWidth - barWidth) / 2
        const y = baseline - barHeight
        return (
          <g key={`${item.label}-${index}`}>
            <rect className="statistics-column" fill={chartColors[index % chartColors.length]} height={barHeight} rx="5" width={barWidth} x={x} y={y}>
              <title>{`${item.label}: ${formatChartValue(safeChartValue(item.value))}`}</title>
            </rect>
            <text className="statistics-axis-label" textAnchor="middle" x={x + barWidth / 2} y={baseline + 20}>{compactLabel(item.label)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function BarsChart({ data, title }: Pick<StatisticsChartProps, 'data' | 'title'>) {
  const width = 540
  const rowHeight = 40
  const height = Math.max(150, data.length * rowHeight + 34)
  const padding = { top: 16, right: 30, bottom: 16, left: 145 }
  const chartWidth = width - padding.left - padding.right
  const max = maximumValue(data)

  return (
    <svg aria-label={title} className="statistics-chart-svg statistics-bars-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
      <title>{`${title}: gráfico de barras`}</title>
      {data.map((item, index) => {
        const y = padding.top + index * rowHeight
        const barWidth = (safeChartValue(item.value) / max) * chartWidth
        return (
          <g key={`${item.label}-${index}`}>
            <text className="statistics-axis-label" textAnchor="end" x={padding.left - 10} y={y + 17}>{compactLabel(item.label, 19)}</text>
            <rect className="statistics-bar-track" height="22" rx="5" width={chartWidth} x={padding.left} y={y} />
            <rect className="statistics-column" fill={chartColors[index % chartColors.length]} height="22" rx="5" width={barWidth} x={padding.left} y={y}>
              <title>{`${item.label}: ${formatChartValue(safeChartValue(item.value))}`}</title>
            </rect>
            <text className="statistics-bar-value" x={Math.min(padding.left + barWidth + 7, width - 24)} y={y + 16}>{formatChartValue(safeChartValue(item.value))}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function StatisticsChart({ data, type, title, valueLabel, pieLabelMode }: StatisticsChartProps) {
  if (!hasValues(data)) {
    return <div className="statistics-chart-empty">Ainda não há dados suficientes para este gráfico.</div>
  }

  return (
    <div className="statistics-chart">
      {type === 'pie' && <PieChart data={data} pieLabelMode={pieLabelMode} title={title} valueLabel={valueLabel} />}
      {type === 'columns' && <ColumnsChart data={data} title={title} />}
      {type === 'line' && <VerticalChart data={data} title={title} />}
      {type === 'bars' && <BarsChart data={data} title={title} />}
      {type === 'area' && <VerticalChart area data={data} title={title} />}
      {type !== 'pie' && <ChartLegend data={data} valueLabel={valueLabel} />}
    </div>
  )
}

/** Renders the reusable, dependency-free SVG charts used by academic statistics. */

export type StatisticsChartType = 'pie' | 'columns' | 'line' | 'bars' | 'area'

export interface ChartDatum {
  label: string
  value: number
}

interface StatisticsChartProps {
  data: ChartDatum[]
  type: StatisticsChartType
  title: string
  valueLabel?: (value: number) => string
}

const chartColors = [
  'var(--statistics-chart-1)',
  'var(--statistics-chart-2)',
  'var(--statistics-chart-3)',
  'var(--statistics-chart-4)',
  'var(--statistics-chart-5)',
  'var(--statistics-chart-6)',
]

function compactLabel(value: string, maximum = 12): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value
}

function maximumValue(data: ChartDatum[]): number {
  return Math.max(1, ...data.map((item) => item.value))
}

function hasValues(data: ChartDatum[]): boolean {
  return data.some((item) => item.value > 0)
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function pieSlicePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarPoint(cx, cy, radius, endAngle)
  const end = polarPoint(cx, cy, radius, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

function ChartLegend({ data, valueLabel }: Pick<StatisticsChartProps, 'data' | 'valueLabel'>) {
  return (
    <ul className="statistics-chart-legend">
      {data.map((item, index) => (
        <li key={item.label}>
          <span aria-hidden="true" className="statistics-legend-color" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
          <span className="statistics-legend-label" title={item.label}>{item.label}</span>
          <strong>{valueLabel?.(item.value) ?? item.value}</strong>
        </li>
      ))}
    </ul>
  )
}

function PieChart({ data }: Pick<StatisticsChartProps, 'data'>) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  let angle = 0

  return (
    <svg className="statistics-chart-svg statistics-pie-chart" viewBox="0 0 260 230">
      <title>Gráfico de pizza</title>
      {data.map((item, index) => {
        const portion = (item.value / total) * 360
        const startAngle = angle
        angle += portion

        if (data.length === 1) {
          return <circle cx="130" cy="105" fill={chartColors[index % chartColors.length]} key={item.label} r="88" />
        }

        return (
          <path
            d={pieSlicePath(130, 105, 88, startAngle, angle)}
            fill={chartColors[index % chartColors.length]}
            key={item.label}
            stroke="var(--surface)"
            strokeWidth="2"
          >
            <title>{`${item.label}: ${item.value}`}</title>
          </path>
        )
      })}
      <text className="statistics-pie-total" textAnchor="middle" x="130" y="101">Total</text>
      <text className="statistics-pie-value" textAnchor="middle" x="130" y="124">{total}</text>
    </svg>
  )
}

function VerticalChart({ data, area = false }: Pick<StatisticsChartProps, 'data'> & { area?: boolean }) {
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
    const y = baseline - (item.value / max) * chartHeight
    return { ...item, x, y }
  })
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaPoints = `${padding.left},${baseline} ${polyline} ${padding.left + chartWidth},${baseline}`

  return (
    <svg className="statistics-chart-svg" viewBox={`0 0 ${width} ${height}`}>
      <title>{area ? 'Gráfico de área' : 'Gráfico de linhas'}</title>
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
        <g key={point.label}>
          <circle className="statistics-line-point" cx={point.x} cy={point.y} r="4" style={{ fill: chartColors[index % chartColors.length] }}>
            <title>{`${point.label}: ${point.value}`}</title>
          </circle>
          <text className="statistics-axis-label" textAnchor="middle" x={point.x} y={baseline + 20}>{compactLabel(point.label)}</text>
        </g>
      ))}
    </svg>
  )
}

function ColumnsChart({ data }: Pick<StatisticsChartProps, 'data'>) {
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
    <svg className="statistics-chart-svg" viewBox={`0 0 ${width} ${height}`}>
      <title>Gráfico de colunas</title>
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
        const barHeight = (item.value / max) * chartHeight
        const x = padding.left + slotWidth * index + (slotWidth - barWidth) / 2
        const y = baseline - barHeight
        return (
          <g key={item.label}>
            <rect className="statistics-column" fill={chartColors[index % chartColors.length]} height={barHeight} rx="5" width={barWidth} x={x} y={y}>
              <title>{`${item.label}: ${item.value}`}</title>
            </rect>
            <text className="statistics-axis-label" textAnchor="middle" x={x + barWidth / 2} y={baseline + 20}>{compactLabel(item.label)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function BarsChart({ data }: Pick<StatisticsChartProps, 'data'>) {
  const width = 540
  const rowHeight = 40
  const height = Math.max(150, data.length * rowHeight + 34)
  const padding = { top: 16, right: 30, bottom: 16, left: 145 }
  const chartWidth = width - padding.left - padding.right
  const max = maximumValue(data)

  return (
    <svg className="statistics-chart-svg statistics-bars-chart" viewBox={`0 0 ${width} ${height}`}>
      <title>Gráfico de barras</title>
      {data.map((item, index) => {
        const y = padding.top + index * rowHeight
        const barWidth = (item.value / max) * chartWidth
        return (
          <g key={item.label}>
            <text className="statistics-axis-label" textAnchor="end" x={padding.left - 10} y={y + 17}>{compactLabel(item.label, 19)}</text>
            <rect className="statistics-bar-track" height="22" rx="5" width={chartWidth} x={padding.left} y={y} />
            <rect className="statistics-column" fill={chartColors[index % chartColors.length]} height="22" rx="5" width={barWidth} x={padding.left} y={y}>
              <title>{`${item.label}: ${item.value}`}</title>
            </rect>
            <text className="statistics-bar-value" x={Math.min(padding.left + barWidth + 7, width - 24)} y={y + 16}>{item.value}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function StatisticsChart({ data, type, title, valueLabel }: StatisticsChartProps) {
  if (!hasValues(data)) {
    return <div className="statistics-chart-empty">Ainda não há dados suficientes para este gráfico.</div>
  }

  return (
    <div aria-label={`${title}: visualização em ${type}`} className="statistics-chart" role="img">
      {type === 'pie' && <PieChart data={data} />}
      {type === 'columns' && <ColumnsChart data={data} />}
      {type === 'line' && <VerticalChart data={data} />}
      {type === 'bars' && <BarsChart data={data} />}
      {type === 'area' && <VerticalChart area data={data} />}
      <ChartLegend data={data} valueLabel={valueLabel} />
    </div>
  )
}

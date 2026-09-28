/** Builds a compact, accessible PDF report from the scoped academic statistics. */

import { jsPDF } from 'jspdf'
import { quotaLabel } from '../constants/quotas'
import type { StatisticsData, StatisticsEvolutionPoint, StatisticsFilters, StatisticsSubjectAverage } from '../types'

const margin = 42
const headerHeight = 62
const footerHeight = 28
const primaryColor = [54, 75, 132] as const
const textColor = [31, 41, 55] as const
const mutedColor = [100, 116, 139] as const
const borderColor = [203, 213, 225] as const
const alternateRowColor = [248, 250, 252] as const
const whiteColor = [255, 255, 255] as const

interface PdfContext {
  data: StatisticsData
  filters: StatisticsFilters
  createdAt: Date
}

function setFillColor(doc: jsPDF, color: readonly [number, number, number]): void {
  doc.setFillColor(color[0], color[1], color[2])
}

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

function formatGrade(value: number): string {
  return formatNumber(value, 1)
}

function formatPercent(value: number): string {
  return `${formatNumber(value, 1)}%`
}

function cleanPdfText(value: string): string {
  return value
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replaceAll('…', '...')
}

function fileSafeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLocaleLowerCase('pt-BR')
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value)
}

function filterSummary(filters: StatisticsFilters): string {
  const values = [
    filters.busca_nome && `Aluno: ${filters.busca_nome}`,
    filters.curso && `Curso: ${filters.curso}`,
    filters.turma && `Turma: ${filters.turma}`,
    filters.categoria && `Categoria: ${filters.categoria}`,
    filters.cota && `Categoria de cota: ${quotaLabel(filters.cota)}`,
  ].filter(Boolean)

  return values.length > 0 ? values.join(' | ') : 'Sem filtros adicionais'
}

function dataSourceLabel(source: StatisticsData['dataSource']): string {
  if (source === 'historico') return 'Histórico salvo'
  if (source === 'misto') return 'Histórico parcial'
  return 'Dados atuais'
}

function drawPageHeader(doc: jsPDF, title: string): number {
  const width = doc.internal.pageSize.getWidth()
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, width, headerHeight, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('SGAC', margin, 28)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Sistema de Gerenciamento de Alunos Cotistas', margin, 45)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(cleanPdfText(title), width - margin, 34, { align: 'right' })
  return headerHeight + 28
}

function drawFooter(doc: jsPDF, createdAt: Date): void {
  const totalPages = doc.getNumberOfPages()
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...borderColor)
    doc.line(margin, height - footerHeight, width - margin, height - footerHeight)
    doc.setTextColor(...mutedColor)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Gerado em ${formatDate(createdAt)}`, margin, height - 12)
    doc.text(`Página ${page} de ${totalPages}`, width - margin, height - 12, { align: 'right' })
  }
}

function ensureSpace(doc: jsPDF, cursor: number, heightNeeded: number, continuationTitle: string): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (cursor + heightNeeded <= pageHeight - footerHeight - 12) return cursor
  doc.addPage()
  return drawPageHeader(doc, continuationTitle)
}

function drawSectionTitle(doc: jsPDF, title: string, cursor: number): number {
  const y = ensureSpace(doc, cursor, 28, 'Relatório de estatísticas')
  doc.setTextColor(...primaryColor)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(cleanPdfText(title), margin, y)
  doc.setDrawColor(...borderColor)
  doc.line(margin, y + 6, doc.internal.pageSize.getWidth() - margin, y + 6)
  return y + 23
}

function drawContext(doc: jsPDF, context: PdfContext, cursor: number): number {
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const rows = [
    ['Período', context.data.currentPeriodName],
    ['Escopo', context.data.scope.label],
    ['Origem', dataSourceLabel(context.data.dataSource)],
    ['Filtros', filterSummary(context.filters)],
  ]
  let y = cursor

  doc.setDrawColor(...borderColor)
  doc.setFillColor(248, 250, 252)
  const contents = rows.map(([, value]) => doc.splitTextToSize(cleanPdfText(value), width - 118) as string[])
  const rowHeights = contents.map((lines) => Math.max(20, lines.length * 11 + 8))
  const blockHeight = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0)

  y = ensureSpace(doc, y, blockHeight + 8, 'Relatório de estatísticas')
  doc.roundedRect(margin, y, width, blockHeight, 5, 5, 'FD')

  rows.forEach(([label], index) => {
    const rowTop = y + rowHeights.slice(0, index).reduce((sum, rowHeight) => sum + rowHeight, 0)
    doc.setTextColor(...mutedColor)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(label, margin + 12, rowTop + 14)
    doc.setTextColor(...textColor)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(contents[index], margin + 98, rowTop + 14)
  })

  return y + blockHeight + 20
}

function drawMetricCards(doc: jsPDF, context: PdfContext, cursor: number): number {
  const metrics = [
    ['Alunos visíveis', formatNumber(context.data.totals.students)],
    ['Registros de matéria', formatNumber(context.data.totals.subjectRecords)],
    ['Média geral', formatGrade(context.data.totals.averageGrade)],
    ['Faltas médias', formatPercent(context.data.totals.averageAttendancePercent)],
    ['Em risco', formatNumber(context.data.totals.atRisk)],
    ['Em alerta', formatNumber(context.data.totals.alert)],
  ]
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const cardWidth = (width - 12) / 2
  const cardHeight = 52
  let y = cursor

  for (let index = 0; index < metrics.length; index += 2) {
    y = ensureSpace(doc, y, cardHeight + 10, 'Relatório de estatísticas')
    metrics.slice(index, index + 2).forEach(([label, value], offset) => {
      const x = margin + offset * (cardWidth + 12)
      doc.setDrawColor(...borderColor)
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(x, y, cardWidth, cardHeight, 5, 5, 'FD')
      doc.setTextColor(...mutedColor)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(cleanPdfText(label), x + 12, y + 18)
      doc.setTextColor(...textColor)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(17)
      doc.text(value, x + 12, y + 40)
    })
    y += cardHeight + 10
  }

  return y + 4
}

function drawValueTable(
  doc: jsPDF,
  title: string,
  values: Array<{ label: string; value: number }>,
  cursor: number,
): number {
  let y = drawSectionTitle(doc, title, cursor)
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const labelWidth = width - 92
  const rowHeight = 22

  y = ensureSpace(doc, y, rowHeight * (values.length + 1), 'Relatório de estatísticas')
  doc.setFillColor(...primaryColor)
  doc.rect(margin, y, width, rowHeight, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Indicador', margin + 10, y + 15)
  doc.text('Quantidade', margin + width - 10, y + 15, { align: 'right' })
  y += rowHeight

  values.forEach((entry, index) => {
    const fill = index % 2 === 0 ? alternateRowColor : whiteColor
    setFillColor(doc, fill)
    doc.rect(margin, y, width, rowHeight, 'F')
    doc.setDrawColor(...borderColor)
    doc.rect(margin, y, width, rowHeight)
    doc.setTextColor(...textColor)
    doc.setFont('helvetica', 'normal')
    doc.text(cleanPdfText(entry.label), margin + 10, y + 15, { maxWidth: labelWidth })
    doc.setFont('helvetica', 'bold')
    doc.text(formatNumber(entry.value), margin + width - 10, y + 15, { align: 'right' })
    y += rowHeight
  })

  return y + 18
}

const subjectColumns = [
  { key: 'subject', label: 'Matéria', width: 166 },
  { key: 'studentCount', label: 'Alunos', width: 50 },
  { key: 'averageGrade', label: 'Média', width: 60 },
  { key: 'averageAttendancePercent', label: 'Faltas', width: 69 },
  { key: 'atRisk', label: 'Risco', width: 50 },
  { key: 'alert', label: 'Alerta', width: 55 },
  { key: 'regular', label: 'Regular', width: 61 },
] as const

function subjectValue(subject: StatisticsSubjectAverage, key: typeof subjectColumns[number]['key']): string {
  if (key === 'subject') return subject.subject
  if (key === 'averageGrade') return formatGrade(subject.averageGrade)
  if (key === 'averageAttendancePercent') return formatPercent(subject.averageAttendancePercent)
  return formatNumber(subject[key])
}

function drawSubjectHeader(doc: jsPDF, cursor: number): number {
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const rowHeight = 24
  let x = margin

  doc.setFillColor(...primaryColor)
  doc.rect(margin, cursor, width, rowHeight, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  subjectColumns.forEach((column) => {
    doc.text(column.label, x + 5, cursor + 15, { maxWidth: column.width - 8 })
    x += column.width
  })
  return cursor + rowHeight
}

function drawSubjectTable(doc: jsPDF, subjects: StatisticsSubjectAverage[], cursor: number): number {
  let y = drawSectionTitle(doc, 'Detalhamento por matéria', cursor)
  const tableWidth = doc.internal.pageSize.getWidth() - margin * 2

  if (subjects.length === 0) {
    doc.setTextColor(...mutedColor)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Nenhuma matéria disponível para o período e filtros selecionados.', margin, y)
    return y + 20
  }

  y = ensureSpace(doc, y, 34, 'Relatório de estatísticas')
  y = drawSubjectHeader(doc, y)

  subjects.forEach((subject, index) => {
    const cells = subjectColumns.map((column) => {
      doc.setFontSize(8)
      return doc.splitTextToSize(cleanPdfText(subjectValue(subject, column.key)), column.width - 10) as string[]
    })
    const rowHeight = Math.max(23, ...cells.map((lines) => lines.length * 9 + 10))
    y = ensureSpace(doc, y, rowHeight + 2, 'Relatório de estatísticas')
    if (y === headerHeight + 28) y = drawSubjectHeader(doc, y)

    setFillColor(doc, index % 2 === 0 ? alternateRowColor : whiteColor)
    doc.rect(margin, y, tableWidth, rowHeight, 'F')
    doc.setDrawColor(...borderColor)
    doc.rect(margin, y, tableWidth, rowHeight)
    doc.setTextColor(...textColor)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    let x = margin
    cells.forEach((lines, cellIndex) => {
      doc.text(lines, x + 5, y + 12)
      x += subjectColumns[cellIndex].width
    })
    y += rowHeight
  })

  return y + 6
}

function drawEvolutionTable(doc: jsPDF, evolution: StatisticsEvolutionPoint[], cursor: number): number {
  let y = drawSectionTitle(doc, 'Evolução por período', cursor)
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const columns = [
    { label: 'Período', width: 130 },
    { label: 'Histórico', width: 75 },
    { label: 'Alunos', width: 58 },
    { label: 'Média', width: 62 },
    { label: 'Faltas', width: 72 },
    { label: 'Risco', width: 54 },
    { label: 'Alerta', width: 60 },
  ]
  const rowHeight = 23
  const hasHistory = evolution.some((item) => item.available)

  if (!hasHistory) {
    doc.setTextColor(...mutedColor)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Nenhum retrato histórico foi salvo para comparação.', margin, y)
    return y + 20
  }

  y = ensureSpace(doc, y, rowHeight * (evolution.length + 1), 'Relatório de estatísticas')
  doc.setFillColor(...primaryColor)
  doc.rect(margin, y, width, rowHeight, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  let headerX = margin
  columns.forEach((column) => {
    doc.text(column.label, headerX + 5, y + 15, { maxWidth: column.width - 8 })
    headerX += column.width
  })
  y += rowHeight

  evolution.forEach((item, index) => {
    const values = item.available && item.hasVisibleRecords
      ? [item.label, 'Salvo', formatNumber(item.students), formatGrade(item.averageGrade), formatPercent(item.averageAttendancePercent), formatNumber(item.atRisk), formatNumber(item.alert)]
      : item.available
        ? [item.label, 'Salvo*', '0', formatGrade(0), formatPercent(0), '0', '0']
        : [item.label, 'Não salvo', '-', '-', '-', '-', '-']
    setFillColor(doc, index % 2 === 0 ? alternateRowColor : whiteColor)
    doc.rect(margin, y, width, rowHeight, 'F')
    doc.setDrawColor(...borderColor)
    doc.rect(margin, y, width, rowHeight)
    doc.setTextColor(...textColor)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    let x = margin
    values.forEach((value, valueIndex) => {
      doc.text(cleanPdfText(value), x + 5, y + 15, { maxWidth: columns[valueIndex].width - 8 })
      x += columns[valueIndex].width
    })
    y += rowHeight
  })

  if (evolution.some((item) => item.available && !item.hasVisibleRecords)) {
    doc.setTextColor(...mutedColor)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('* Histórico salvo, sem registros para o filtro atual.', margin, y + 12)
    return y + 28
  }

  return y + 18
}

export function createStatisticsPdf(context: PdfContext): Blob {
  const doc = new jsPDF({
    compress: true,
    format: 'a4',
    orientation: 'portrait',
    unit: 'pt',
  })
  let cursor = drawPageHeader(doc, 'Estatísticas acadêmicas')

  doc.setTextColor(...textColor)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('Relatório de estatísticas acadêmicas', margin, cursor)
  cursor += 17
  doc.setTextColor(...mutedColor)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Resumo consolidado de desempenho, frequência e situações acadêmicas.', margin, cursor)
  cursor += 21

  cursor = drawContext(doc, context, cursor)
  cursor = drawSectionTitle(doc, 'Resumo do período', cursor)
  cursor = drawMetricCards(doc, context, cursor)
  cursor = drawValueTable(doc, 'Situação acadêmica', context.data.statusCounts, cursor)
  cursor = drawValueTable(doc, 'Faixas de nota', context.data.gradeDistribution, cursor)
  cursor = drawValueTable(doc, 'Faixas de faltas', context.data.attendanceDistribution, cursor)
  cursor = drawEvolutionTable(doc, context.data.evolution, cursor)
  drawSubjectTable(doc, context.data.subjectAverages, cursor)
  drawFooter(doc, context.createdAt)

  return doc.output('blob')
}

export function downloadStatisticsPdf(data: StatisticsData, filters: StatisticsFilters): void {
  const createdAt = new Date()
  const url = URL.createObjectURL(createStatisticsPdf({ data, filters, createdAt }))
  const link = document.createElement('a')
  const period = fileSafeName(data.currentPeriodName) || 'academicas'

  link.href = url
  link.download = `estatisticas-${period}.pdf`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

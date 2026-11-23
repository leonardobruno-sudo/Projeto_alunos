/** Papel de `studentBulletinPdf`: transforma, valida ou transporta dados entre a interface e os formatos usados pela API ou por arquivos exportados.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

/** Gera um boletim informativo usando dados que a API já autorizou. */

import { jsPDF } from 'jspdf'
import type { AcademicDataSource, Student, Subject } from '../types'
import { getStudentSubjects } from './students'

const margin = 42
const headerHeight = 62
const footerHeight = 28
const primaryColor = [54, 75, 132] as const
const textColor = [31, 41, 55] as const
const mutedColor = [75, 85, 99] as const
const borderColor = [203, 213, 225] as const
const alternateRowColor = [248, 250, 252] as const
const whiteColor = [255, 255, 255] as const

interface StudentBulletinPdfContext {
  student: Student
  periodName: string
  source: AcademicDataSource
  createdAt?: Date
}

function cleanPdfText(value: string): string {
  return value
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replaceAll('…', '...')
}

function formatNumber(value: number | null | undefined): string {
  const numericValue = Number(value)
  if (value === null || value === undefined || !Number.isFinite(numericValue)) return 'Não informado'

  return numericValue.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function formatPercentage(value: number | null | undefined): string {
  const numericValue = Number(value)
  if (value === null || value === undefined || !Number.isFinite(numericValue)) return 'Não informado'

  return `${numericValue.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function subjectStatus(subject: Pick<Subject, 'situacao_risco' | 'risco_nota' | 'risco_faltas' | 'alerta_nota' | 'alerta_faltas'>): string {
  const serverStatus = String(subject.situacao_risco ?? '').trim().toLocaleLowerCase('pt-BR')
  if (serverStatus.includes('risco') || subject.risco_nota || subject.risco_faltas) return 'Em risco'
  if (serverStatus.includes('alerta') || subject.alerta_nota || subject.alerta_faltas) return 'Alerta'
  return 'Regular'
}

function studentStatus(student: Student): string {
  return subjectStatus(student)
}

function absenceDescription(subject: Subject): string {
  const totalClasses = Number(subject.total_aulas)
  const absences = formatNumber(subject.faltas)
  return Number.isFinite(totalClasses) && totalClasses > 0
    ? `${absences} de ${formatNumber(totalClasses)} aulas`
    : absences
}

function attendancePercentage(subject: Subject): string {
  const absencePercentage = Number(subject.percentual_faltas)
  if (!Number.isFinite(absencePercentage)) return 'Não informado'

  return formatPercentage(Math.min(100, Math.max(0, 100 - absencePercentage)))
}

function sourceLabel(source: AcademicDataSource): string {
  return source === 'historico' ? 'Histórico fechado' : 'Dados atuais'
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

function ensureSpace(doc: jsPDF, cursor: number, heightNeeded: number): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (cursor + heightNeeded <= pageHeight - footerHeight - 12) return cursor

  doc.addPage()
  return drawPageHeader(doc, 'Boletim informativo')
}

function drawFooter(doc: jsPDF, createdAt: Date): void {
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const totalPages = doc.getNumberOfPages()

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

function drawContext(doc: jsPDF, context: StudentBulletinPdfContext, cursor: number): number {
  const { student } = context
  const rows = [
    ['Aluno', student.nome],
    ['Matrícula', student.matricula],
    ['Curso / turma', [student.curso, student.turma ? `Turma ${student.turma}` : ''].filter(Boolean).join(' · ') || 'Não informado'],
    ['Período', context.periodName],
    ['Origem dos dados', sourceLabel(context.source)],
  ]
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const valueWidth = width - 112
  const lines = rows.map(([, value]) => doc.splitTextToSize(cleanPdfText(value || 'Não informado'), valueWidth) as string[])
  const heights = lines.map((entry) => Math.max(22, entry.length * 11 + 9))
  const blockHeight = heights.reduce((total, value) => total + value, 0)
  const y = ensureSpace(doc, cursor, blockHeight + 8)

  doc.setDrawColor(...borderColor)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, y, width, blockHeight, 5, 5, 'FD')

  rows.forEach(([label], index) => {
    const rowTop = y + heights.slice(0, index).reduce((total, value) => total + value, 0)
    doc.setTextColor(...mutedColor)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(label, margin + 12, rowTop + 14)
    doc.setTextColor(...textColor)
    doc.setFont('helvetica', 'normal')
    doc.text(lines[index], margin + 102, rowTop + 14)
  })

  return y + blockHeight + 20
}

function drawSummary(doc: jsPDF, student: Student, cursor: number): number {
  const values = [
    ['Nota geral', formatNumber(student.nota_final)],
    ['Faltas', formatPercentage(student.taxa_faltas)],
    ['Situação', studentStatus(student)],
  ]
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const gap = 10
  const cardWidth = (width - gap * 2) / values.length
  const cardHeight = 52
  const y = ensureSpace(doc, cursor, cardHeight + 14)

  values.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + gap)
    doc.setDrawColor(...borderColor)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(x, y, cardWidth, cardHeight, 5, 5, 'FD')
    doc.setTextColor(...mutedColor)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(label, x + 10, y + 17, { maxWidth: cardWidth - 20 })
    doc.setTextColor(...textColor)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(cleanPdfText(value), x + 10, y + 37, { maxWidth: cardWidth - 20 })
  })

  return y + cardHeight + 22
}

const subjectColumns = [
  { label: 'Matéria', width: 160 },
  { label: 'Nota', width: 55 },
  { label: 'Faltas', width: 80 },
  { label: 'Justif.', width: 54 },
  { label: 'Frequência', width: 80 },
  { label: 'Situação', width: 82 },
] as const

function drawSubjectHeader(doc: jsPDF, cursor: number): number {
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const rowHeight = 24
  let x = margin

  doc.setFillColor(...primaryColor)
  doc.rect(margin, cursor, width, rowHeight, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  subjectColumns.forEach((column) => {
    doc.text(column.label, x + 5, cursor + 15, { maxWidth: column.width - 8 })
    x += column.width
  })

  return cursor + rowHeight
}

function subjectValues(subject: Subject): string[] {
  return [
    subject.name,
    formatNumber(subject.nota),
    absenceDescription(subject),
    formatNumber(subject.faltas_justificadas ?? subject.justificadas),
    attendancePercentage(subject),
    subjectStatus(subject),
  ]
}

function drawSubjects(doc: jsPDF, subjects: Subject[], cursor: number): number {
  const width = doc.internal.pageSize.getWidth() - margin * 2
  let y = ensureSpace(doc, cursor, 44)

  doc.setTextColor(...primaryColor)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Notas e frequência por matéria', margin, y)
  doc.setDrawColor(...borderColor)
  doc.line(margin, y + 6, doc.internal.pageSize.getWidth() - margin, y + 6)
  y += 18

  if (subjects.length === 0) {
    doc.setTextColor(...mutedColor)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Nenhuma matéria foi registrada para este período.', margin, y)
    return y + 18
  }

  y = ensureSpace(doc, y, 34)
  y = drawSubjectHeader(doc, y)

  subjects.forEach((subject, index) => {
    const values = subjectValues(subject)
    const cells = values.map((value, cellIndex) => {
      doc.setFontSize(8)
      return doc.splitTextToSize(cleanPdfText(value), subjectColumns[cellIndex].width - 10) as string[]
    })
    const rowHeight = Math.max(24, ...cells.map((lines) => lines.length * 9 + 10))
    y = ensureSpace(doc, y, rowHeight + 2)
    if (y === headerHeight + 28) y = drawSubjectHeader(doc, y)

    const fillColor = index % 2 === 0 ? alternateRowColor : whiteColor
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2])
    doc.rect(margin, y, width, rowHeight, 'F')
    doc.setDrawColor(...borderColor)
    doc.rect(margin, y, width, rowHeight)
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

  return y + 14
}

export function createStudentBulletinPdf(context: StudentBulletinPdfContext): Blob {
  const createdAt = context.createdAt ?? new Date()
  const doc = new jsPDF({
    compress: true,
    format: 'a4',
    orientation: 'portrait',
    unit: 'pt',
  })
  let cursor = drawPageHeader(doc, 'Boletim informativo')

  doc.setTextColor(...textColor)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('Boletim informativo', margin, cursor)
  cursor += 18
  doc.setTextColor(...mutedColor)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  const disclaimer = 'Este arquivo apresenta os dados acadêmicos disponíveis no SGAC e não substitui um documento oficial da instituição.'
  const disclaimerLines = doc.splitTextToSize(cleanPdfText(disclaimer), doc.internal.pageSize.getWidth() - margin * 2) as string[]
  doc.text(disclaimerLines, margin, cursor)
  cursor += disclaimerLines.length * 10 + 16

  cursor = drawContext(doc, context, cursor)
  cursor = drawSummary(doc, context.student, cursor)
  drawSubjects(doc, getStudentSubjects(context.student), cursor)
  drawFooter(doc, createdAt)

  return doc.output('blob')
}

export function downloadStudentBulletinPdf(context: StudentBulletinPdfContext): void {
  const createdAt = context.createdAt ?? new Date()
  const document = createStudentBulletinPdf({ ...context, createdAt })
  const url = URL.createObjectURL(document)
  const link = window.document.createElement('a')
  const studentId = fileSafeName(context.student.matricula) || 'aluno'
  const period = fileSafeName(context.periodName) || 'periodo'

  link.href = url
  link.download = `boletim-informativo-${studentId}-${period}.pdf`
  link.style.display = 'none'
  window.document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

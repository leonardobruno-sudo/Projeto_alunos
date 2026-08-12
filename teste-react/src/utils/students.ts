/** Responsabilidade: normaliza dados de alunos e calcula textos de apresentação. */

import type { Student, StudentListData, Subject, SubjectData } from '../types'

function numberOrZero(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function booleanFromUnknown(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value !== 'string') return false

  return ['1', 'sim', 'true'].includes(value.trim().toLocaleLowerCase('pt-BR'))
}

function subjectFromUnknown(value: unknown): Subject | null {
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const name = String(record.name ?? '').trim()
  if (!name) return null

  return {
    name,
    nota: numberOrZero(record.nota),
    faltas: numberOrZero(record.faltas),
    faltas_justificadas: numberOrZero(record.faltas_justificadas ?? record.justificadas),
    total_aulas: numberOrZero(record.total_aulas),
    percentual_faltas: numberOrZero(record.percentual_faltas),
    risco_nota: booleanFromUnknown(record.risco_nota),
    alerta_nota: booleanFromUnknown(record.alerta_nota),
    risco_faltas: booleanFromUnknown(record.risco_faltas),
    alerta_faltas: booleanFromUnknown(record.alerta_faltas),
    situacao_risco: asText(record.situacao_risco) || null,
  }
}

export function getStudentSubjects(student: Student): Subject[] {
  const source = student.subjects ?? student.materias_json
  let values: unknown[] = []

  if (Array.isArray(source)) {
    values = source
  } else if (typeof source === 'string' && source.trim()) {
    try {
      const parsed = JSON.parse(source)
      if (Array.isArray(parsed)) values = parsed
    } catch {
      values = []
    }
  }

  return values.map(subjectFromUnknown).filter((subject): subject is Subject => subject !== null)
}

export function getStudents(data: StudentListData | Student[] | SubjectData): Student[] {
  if (Array.isArray(data)) return data
  return data.alunos ?? data.students ?? []
}

export function getPeriodOptions(data: StudentListData | SubjectData, fallback: string[]): string[] {
  return data.periodOptions && data.periodOptions.length > 0 ? data.periodOptions : fallback
}

export function getSubjectNames(students: Student[]): string[] {
  const names = new Map<string, string>()

  students.forEach((student) => {
    getStudentSubjects(student).forEach((subject) => {
      const key = subject.name.trim().toLocaleLowerCase('pt-BR')
      if (key && !names.has(key)) names.set(key, subject.name)
    })
  })

  return [...names.values()]
}

export function getStudentStatus(student: Student): string {
  const subjects = getStudentSubjects(student)
  const statuses = [student.situacao_risco, ...subjects.map((subject) => subject.situacao_risco)]
    .map((status) => asText(status).toLocaleLowerCase('pt-BR'))

  const hasRisk = statuses.some((status) => status.includes('risco')) ||
    subjects.some((subject) => subject.risco_nota || subject.risco_faltas)
  if (hasRisk) return 'Em risco'

  const hasWarning = statuses.some((status) => status.includes('alerta')) ||
    subjects.some((subject) => subject.alerta_nota || subject.alerta_faltas)
  if (hasWarning) return 'Alerta'

  return 'Regular'
}

export function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

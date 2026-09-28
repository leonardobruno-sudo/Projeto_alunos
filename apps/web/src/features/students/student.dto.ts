/**
 * DTOs at the React boundary. API values are treated as unknown before this
 * module turns them into the compact shapes rendered by the student search.
 */
import type { AcademicDataSource, Student, StudentListData } from '../../types'

export interface StudentListItemDto {
  matricula: string
  nome: string
  telefone: string | null
  curso: string | null
  turma: string | null
  nota_final: number | null
  taxa_faltas: number | null
  risco_nota: boolean
  risco_faltas: boolean
  situacao_risco: string | null
}

export interface StudentListDto {
  alunos: StudentListItemDto[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  periodIndex: number
  currentPeriodName: string
  periodOptions: string[]
  dataSource: AcademicDataSource
  hasPeriodSnapshot: boolean
  snapshotAt: string | null
}

function textOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function toStudentListItemDto(student: Student): StudentListItemDto {
  return {
    matricula: String(student.matricula ?? ''),
    nome: String(student.nome ?? ''),
    telefone: textOrNull(student.telefone),
    curso: textOrNull(student.curso),
    turma: textOrNull(student.turma),
    nota_final: numberOrNull(student.nota_final),
    taxa_faltas: numberOrNull(student.taxa_faltas),
    risco_nota: student.risco_nota === true,
    risco_faltas: student.risco_faltas === true,
    situacao_risco: textOrNull(student.situacao_risco),
  }
}

/** Converts the API list envelope into a predictable view model. */
export function toStudentListDto(data: StudentListData | Student[]): StudentListDto {
  const envelope = Array.isArray(data) ? { alunos: data } : data
  const alunos = (envelope.alunos ?? envelope.students ?? []).map(toStudentListItemDto)
  const total = Number(envelope.total)
  const page = Number(envelope.page)
  const pageSize = Number(envelope.pageSize)
  const totalPages = Number(envelope.totalPages)
  const periodIndex = Number(envelope.periodIndex)

  return {
    alunos,
    total: Number.isFinite(total) ? total : alunos.length,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize) && pageSize > 0 ? pageSize : alunos.length || 20,
    totalPages: Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1,
    hasPreviousPage: envelope.hasPreviousPage === true,
    hasNextPage: envelope.hasNextPage === true,
    periodIndex: Number.isInteger(periodIndex) ? periodIndex : 0,
    currentPeriodName: envelope.currentPeriodName ?? '',
    periodOptions: envelope.periodOptions ?? [],
    dataSource: envelope.dataSource === 'historico' ? 'historico' : 'atual',
    hasPeriodSnapshot: envelope.hasPeriodSnapshot === true,
    snapshotAt: textOrNull(envelope.snapshotAt),
  }
}

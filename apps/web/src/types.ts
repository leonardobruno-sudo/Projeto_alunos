/** Shared TypeScript contracts for application state and API payloads. */

export type PageKey =
  | 'dashboard'
  | 'estatisticas'
  | 'cadastro'
  | 'materias'
  | 'periodos'
  | 'configuracoes'
  | 'permissoes'

export interface User {
  id: number
  username: string
  role: string
  matricula?: string | null
  nome?: string | null
  curso?: string | null
  disciplina?: string | null
  turma?: string | null
  hasProfilePhoto?: boolean
  profilePhotoVersion?: number
  capabilities?: {
    canManageStudents?: boolean
    canRegisterStudents?: boolean
    canDeleteStudents?: boolean
    canExportCsv?: boolean
    canEditOwnSubject?: boolean
    canManageUsers?: boolean
  }
}

export interface Subject {
  name: string
  nota?: number
  faltas?: number
  faltas_justificadas?: number
  justificadas?: number
  total_aulas?: number
  percentual_faltas?: number
  risco_nota?: boolean
  alerta_nota?: boolean
  risco_faltas?: boolean
  alerta_faltas?: boolean
  situacao_risco?: string | null
}

export interface Student {
  matricula: string
  nome: string
  telefone?: string | null
  cotista?: string | null
  cota_detalhada?: string | null
  categoria?: string | null
  nota_final?: number | null
  taxa_faltas?: number | null
  faltas_justificadas?: number | null
  total_aulas?: number | null
  curso?: string | null
  disciplina?: string | null
  turma?: string | null
  descricao?: string | null
  subjects?: Subject[]
  materias_json?: Subject[] | string | null
  situacao_risco?: string | null
  risco_nota?: boolean
  risco_faltas?: boolean
  alerta_nota?: boolean
  alerta_faltas?: boolean
}

export interface StudentFilters {
  q?: string
  busca_matricula?: string
  busca_nome?: string
  periodo?: number
  /** Escolhe entre o cadastro que pode ser alterado e um fechamento acadêmico. */
  fonte?: AcademicDataSource
  curso?: string
  turma?: string
  categoria?: string
  cota?: string
  situacao?: 'risco' | 'alerta' | 'regular' | ''
  page?: number
  pageSize?: number
  sort?: 'nome' | 'matricula' | 'nota_final' | 'taxa_faltas' | 'situacao_risco'
  direction?: 'asc' | 'desc'
}

export interface StudentListData {
  alunos?: Student[]
  students?: Student[]
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
  hasPreviousPage?: boolean
  hasNextPage?: boolean
  sort?: string
  direction?: 'asc' | 'desc'
  filters?: StudentFilters
  subjectNames?: string[]
  periodIndex?: number
  currentPeriodName?: string
  periodOptions?: string[]
  /** Origem efetivamente usada pelo servidor para os indicadores desta resposta. */
  dataSource?: AcademicDataSource
  /** Informa que existe um fechamento salvo para o período, mesmo em dados atuais. */
  hasPeriodSnapshot?: boolean
  /** Data de captura do fechamento, quando a origem consultada é histórica. */
  snapshotAt?: string | null
  canManageStudents?: boolean
}

export interface SubjectData {
  subject?: string
  students?: Student[]
  alunos?: Student[]
  periodIndex?: number
  currentPeriodName?: string
  periodOptions?: string[]
  dataSource?: AcademicDataSource
  hasPeriodSnapshot?: boolean
  snapshotAt?: string | null
  canManageStudents?: boolean
}

export type AcademicDataSource = 'atual' | 'historico'

/** Resposta detalhada do boletim individual, incluindo a origem dos indicadores. */
export interface StudentDetailData {
  aluno: Student
  periodIndex?: number
  currentPeriodName?: string
  periodOptions?: string[]
  dataSource?: AcademicDataSource
  hasPeriodSnapshot?: boolean
  snapshotAt?: string | null
}

export interface ProfessorSubjectPayload {
  nota: number
  faltas: number
  faltas_justificadas: number
  total_aulas: number
}

export interface StatisticsFilters {
  periodo?: number
  busca_nome?: string
  curso?: string
  turma?: string
  categoria?: string
  cota?: string
}

export interface StatisticsValue {
  label: string
  value: number
}

export interface StatisticsSubjectAverage {
  subject: string
  studentCount: number
  averageGrade: number
  averageAttendancePercent: number
  atRisk: number
  alert: number
  regular: number
}

export interface StatisticsTotals {
  students: number
  subjectRecords: number
  averageGrade: number
  averageAttendancePercent: number
  atRisk: number
  alert: number
  regular: number
}

export interface StatisticsScope {
  role: string
  label: string
}

export type StatisticsDataSource = 'historico' | 'atual' | 'misto'

export interface StatisticsHistory {
  periodSaved: boolean
  historicalStudents: number
  liveStudents: number
  dataSource: StatisticsDataSource
}

export interface StatisticsEvolutionPoint {
  periodIndex: number
  label: string
  available: boolean
  hasVisibleRecords: boolean
  students: number
  averageGrade: number
  averageAttendancePercent: number
  atRisk: number
  alert: number
  regular: number
}

export interface AcademicHistorySaveResult {
  periodIndex: number
  totalStudents: number
  created: number
  updated: number
  unchanged: number
  currentPeriodName: string
  overwrite: boolean
}

export interface StatisticsData {
  periodIndex: number
  currentPeriodName: string
  currentTimestamp?: string
  periodOptions: string[]
  scope: StatisticsScope
  filters: StatisticsFilters
  historyAvailable: boolean
  hasPeriodSnapshot: boolean
  dataSource: StatisticsDataSource
  history: StatisticsHistory
  evolution: StatisticsEvolutionPoint[]
  totals: StatisticsTotals
  statusCounts: StatisticsValue[]
  gradeDistribution: StatisticsValue[]
  attendanceDistribution: StatisticsValue[]
  subjectAverages: StatisticsSubjectAverage[]
}

export interface StudentPayload {
  matricula: string
  nome: string
  telefone: string
  curso: string
  disciplina: string
  categoria: string
  turma: string
  descricao: string
  tipo_cota: string
  cotista: string
  cota_detalhada: string
  subjects: Subject[]
}

export interface StudentMovePayload {
  nova_disciplina?: string
  nova_categoria?: string
  nova_turma?: string
}

export interface StudentImportError {
  line: number
  matricula?: string | null
  message: string
}

export interface StudentImportLine {
  line: number
  matricula?: string | null
}

export interface StudentImportSkippedLine extends StudentImportLine {
  reason: string
}

export interface StudentImportResult {
  imported: StudentImportLine[]
  skipped: StudentImportSkippedLine[]
  errors: StudentImportError[]
  summary: {
    imported: number
    skipped: number
    errors: number
  }
}

export interface UserUpdatePayload {
  role: string
  curso: string
  disciplina: string
  turma: string
}

export interface UserCreatePayload {
  username: string
  password: string
  role: string
  nome?: string
  curso?: string
  disciplina?: string
  turma?: string
}

export interface ApiResult<T> {
  data: T
  message: string
}

export interface ChatResponse {
  message: string
  mode: 'ai' | 'contextual'
  intent: string
  sources: string[]
  scope: {
    role: string
    access: 'global' | 'curso' | 'turma' | 'proprio' | 'nenhum'
    curso?: string | null
    disciplina?: string | null
    turma?: string | null
  }
}

export const DEFAULT_PERIODS = [
  'Bimestre 1',
  'Bimestre 2',
  'Bimestre 3',
  'Bimestre 4',
  'Semestre 1',
  'Semestre 2',
]

/** True only for roles allowed to edit a complete student enrollment. */
export function canManageStudents(user: User): boolean {
  if (user.role === 'Professor' || user.role === 'Aluno') return false
  if (typeof user.capabilities?.canManageStudents === 'boolean') {
    return user.capabilities.canManageStudents
  }
  return ['Admin', 'Diretor'].includes(user.role)
}

/** Controls access to the Cadastro page, including manual registration. */
export function canRegisterStudents(user: User): boolean {
  if (user.role === 'Professor' || user.role === 'Aluno') return false
  if (typeof user.capabilities?.canRegisterStudents === 'boolean') {
    return user.capabilities.canRegisterStudents
  }
  return ['Admin', 'Diretor'].includes(user.role)
}

/** A professor may update indicators only for the discipline assigned to them. */
export function canEditAssignedSubject(user: User): boolean {
  if (user.role !== 'Professor') return false
  if (typeof user.capabilities?.canEditOwnSubject === 'boolean') {
    return user.capabilities.canEditOwnSubject
  }
  return Boolean(user.disciplina?.trim())
}

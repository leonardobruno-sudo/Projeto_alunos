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
  capabilities?: {
    canManageStudents?: boolean
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
}

export interface StudentFilters {
  busca_matricula?: string
  busca_nome?: string
  periodo?: number
}

export interface StudentListData {
  alunos?: Student[]
  students?: Student[]
  total?: number
  periodIndex?: number
  currentPeriodName?: string
  periodOptions?: string[]
  canManageStudents?: boolean
}

export interface SubjectData {
  subject?: string
  students?: Student[]
  alunos?: Student[]
  periodIndex?: number
  currentPeriodName?: string
  periodOptions?: string[]
  canManageStudents?: boolean
}

export interface StatisticsFilters {
  periodo?: number
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

export const DEFAULT_PERIODS = [
  'Bimestre 1',
  'Bimestre 2',
  'Bimestre 3',
  'Bimestre 4',
  'Semestre 1',
  'Semestre 2',
]

export function canManageStudents(user: User): boolean {
  if (typeof user.capabilities?.canManageStudents === 'boolean') {
    return user.capabilities.canManageStudents
  }
  return ['Admin', 'Diretor', 'Professor'].includes(user.role)
}

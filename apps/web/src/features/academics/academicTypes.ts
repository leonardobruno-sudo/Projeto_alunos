/** Papel de `academicTypes`: agrupa uma funcionalidade do produto e integra sua apresentação com os tipos e serviços que a alimentam.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

/**
 * Contratos de dados usados pela tela de Vida Acadêmica.
 *
 * O cadastro atual do aluno contém somente indicadores consolidados por matéria.
 * Estes contratos mantêm aulas, eventos e avaliações em registros separados
 * para conectar a interface a futuras APIs sem fabricar
 * um cronograma ou histórico de frequência no navegador.
 */

export type AcademicViewerRole = 'Aluno' | 'Professor' | 'Diretor' | 'Admin' | string

export interface AcademicViewer {
  id?: number | string
  name?: string | null
  role: AcademicViewerRole
}

export interface AcademicPeriodOption {
  id: string
  label: string
  /** Datas ISO-8601 opcionais, fornecidas quando constam na API de calendário. */
  startsAt?: string | null
  endsAt?: string | null
  current?: boolean
}

export interface AcademicPeriod {
  id: string
  label: string
  startsAt?: string | null
  endsAt?: string | null
  /** Situação em texto calculada pelo servidor acadêmico, como “Em andamento”. */
  status?: string | null
}

export type AcademicCalendarEventKind = 'letivo' | 'avaliacao' | 'recesso' | 'prazo' | 'outro'

export interface AcademicCalendarEvent {
  id: string
  title: string
  kind: AcademicCalendarEventKind
  startsAt: string
  endsAt?: string | null
  allDay?: boolean
  description?: string | null
  subjectId?: string | null
  subjectName?: string | null
}

export type AcademicSessionStatus = 'prevista' | 'realizada' | 'cancelada'

export interface AcademicClassSession {
  id: string
  subjectId: string
  subjectName: string
  startsAt: string
  /** Indica quando a origem salva somente a data da aula, sem horário. */
  allDay?: boolean
  endsAt?: string | null
  status: AcademicSessionStatus
  room?: string | null
  instructorName?: string | null
  content?: string | null
  /** Resultado calculado no servidor para a pessoa; não representa presença presumida. */
  attendanceStatus?: 'presente' | 'ausente' | 'justificada' | 'nao_lancada' | null
}

export type AttendanceStatus = 'regular' | 'alerta' | 'risco' | 'indisponivel'

export interface AcademicAttendance {
  subjectId: string
  subjectName: string
  /** Aparece somente em telas da equipe que incluem mais de um aluno. */
  studentMatricula?: string | null
  totalClasses?: number | null
  /** Quantidade de aulas cuja frequência já foi registrada. */
  registeredClasses?: number | null
  attendedClasses?: number | null
  missedClasses?: number | null
  justifiedAbsences?: number | null
  /** A API calcula e autoriza o percentual e sua classificação. */
  absencePercent?: number | null
  status?: AttendanceStatus | null
  updatedAt?: string | null
}

export type AcademicAssessmentStatus = 'prevista' | 'disponivel' | 'corrigida' | 'encerrada'

export interface AcademicAssessment {
  id: string
  subjectId: string
  subjectName: string
  title: string
  status: AcademicAssessmentStatus
  occursAt?: string | null
  dueAt?: string | null
  grade?: number | null
  /** Quantidade de registros corrigidos dentro do escopo autorizado da equipe. */
  gradeCount?: number | null
  maximumGrade?: number | null
  weight?: number | null
  feedback?: string | null
}

export type AcademicDocumentStatus = 'disponivel' | 'em_analise' | 'indisponivel'

export interface AcademicDocument {
  id: string
  title: string
  description?: string | null
  status: AcademicDocumentStatus
  issuedAt?: string | null
  canRequest?: boolean
}

export interface AcademicSubjectReference {
  id: string
  name: string
  code?: string | null
  instructorName?: string | null
  workloadHours?: number | null
}

/** Referência mínima do aluno no formulário da equipe; não duplica dados acadêmicos. */
export interface AcademicStudentReference {
  matricula: string
  name: string
}

/** Aluno inscrito em um diário específico; não é resultado de uma busca geral. */
export interface AcademicDiaryEnrollment extends AcademicStudentReference {
  diaryId: string
  active: boolean
}

export interface AcademicCalendarEventInput {
  title: string
  kind: AcademicCalendarEventKind
  startsAt: string
  endsAt?: string | null
  allDay: boolean
  description?: string | null
  subjectId?: string | null
}

export interface AcademicClassSessionInput {
  subjectId: string
  title: string
  startsAt: string
  content?: string | null
}

export interface AcademicAttendanceInput {
  classSessionId: string
  studentMatricula: string
  status: 'presente' | 'ausente' | 'justificada'
}

export interface AcademicAssessmentInput {
  subjectId: string
  title: string
  occursAt: string
  maximumGrade?: number | null
  weight?: number | null
}

export interface AcademicGradeInput {
  assessmentId: string
  studentMatricula: string
  grade: number
  feedback?: string | null
}

export interface AcademicEnrollmentInput {
  subjectId: string
  matriculas: string[]
}

/**
 * As ações de gravação não conhecem endereços de API. A página que as contém
 * as conecta ao cliente de API, que continua sujeito às permissões do servidor.
 */
export interface AcademicManagementCallbacks {
  onCreateCalendarEvent?: (input: AcademicCalendarEventInput) => void | Promise<void>
  onCreateClassSession?: (input: AcademicClassSessionInput) => void | Promise<void>
  onRecordAttendance?: (input: AcademicAttendanceInput) => void | Promise<void>
  onCreateAssessment?: (input: AcademicAssessmentInput) => void | Promise<void>
  onRecordGrade?: (input: AcademicGradeInput) => void | Promise<void>
  onEnrollStudents?: (input: AcademicEnrollmentInput) => void | Promise<void>
}

export interface AcademicManagementPanelProps extends AcademicManagementCallbacks {
  period: AcademicPeriod
  subjects: AcademicSubjectReference[]
  classSessions: AcademicClassSession[]
  assessments: AcademicAssessment[]
  enrollments: AcademicDiaryEnrollment[]
}

export interface AcademicLifeData {
  period: AcademicPeriod
  periodOptions?: AcademicPeriodOption[]
  scopeLabel?: string | null
  subjects: AcademicSubjectReference[]
  calendarEvents: AcademicCalendarEvent[]
  classSessions: AcademicClassSession[]
  attendance: AcademicAttendance[]
  assessments: AcademicAssessment[]
  documents: AcademicDocument[]
  /** Horário opcional fornecido pelo servidor para indicar a origem do dado. */
  updatedAt?: string | null
}

export type AcademicLifeLoadState = 'loading' | 'ready' | 'error'

export interface AcademicLifePageProps {
  viewer: AcademicViewer
  data: AcademicLifeData | null
  loadState: AcademicLifeLoadState
  errorMessage?: string | null
  /** Mantém os dados atuais disponíveis enquanto a página os atualiza. */
  refreshing?: boolean
  requestingDocumentId?: string | null
  onRetry?: () => void
  onPeriodChange?: (periodId: string) => void
  onOpenSubject?: (subjectId: string) => void
  onRequestDocument?: (document: AcademicDocument) => void | Promise<void>
}

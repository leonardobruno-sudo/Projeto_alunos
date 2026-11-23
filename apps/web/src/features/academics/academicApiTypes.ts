/** Papel de `academicApiTypes`: agrupa uma funcionalidade do produto e integra sua apresentação com os tipos e serviços que a alimentam.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

/**
 * Formatos de dados trocados com a API normalizada de Vida Acadêmica.
 *
 * Eles representam os registros explícitos de diário e calendário do servidor
 * em vez de reutilizar o modelo consolidado legado `materias_json`.
 */

export interface AcademicCalendarApi {
  id: number
  titulo: string
  curso: string
  turma: string | null
  periodo: number
  inicioEm: string
  fimEm: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export interface AcademicCalendarEventApi {
  id: number
  calendarioId: number
  titulo: string
  descricao: string | null
  tipo: 'Academico' | 'Avaliacao' | 'Reuniao' | 'Prazo' | 'Outro'
  inicioEm: string
  fimEm: string
  visivelParaAlunos: boolean
  criadoEm: string
  atualizadoEm: string
}

export interface AcademicDiaryApi {
  id: number
  curso: string
  turma: string
  disciplina: string
  periodo: number
  professorUsuarioId: number | null
  professorNome: string | null
  status: 'aberto' | 'fechado'
  criadoEm: string
  atualizadoEm: string
}

/** Referência segura de equipe devolvida apenas a perfis que podem atribuir um diário. */
export interface AcademicProfessorApi {
  id: number
  username: string
  nome: string
  curso: string
  turma: string
  disciplina: string
}

export interface AcademicLessonApi {
  id: number
  diarioId: number
  dataAula: string
  titulo: string
  conteudo: string | null
  cargaHoraria: number
  criadoEm: string
  atualizadoEm: string
}

export interface AcademicAttendanceApi {
  id: number
  aulaId: number
  matricula: string
  situacao: 'PRESENTE' | 'FALTA' | 'JUSTIFICADA'
  observacao: string | null
  registradoEm: string
  atualizadoEm: string
}

/** Indicador oficial de frequência calculado pela API acadêmica. */
export interface AcademicAttendanceSummaryApi {
  diarioId: number
  matricula: string
  totalClasses: number
  registeredClasses: number
  attendedClasses: number
  missedClasses: number
  justifiedAbsences: number
  absencePercent: number | null
  status: 'regular' | 'alerta' | 'risco' | 'indisponivel'
}

export interface AcademicDiaryEnrollmentApi {
  diarioId: number
  matricula: string
  nome: string
  ativa: boolean
}

export interface AcademicAssessmentApi {
  id: number
  diarioId: number
  titulo: string
  descricao: string | null
  dataAvaliacao: string
  peso: number
  notaMaxima: number
  criadoEm: string
  atualizadoEm: string
}

export interface AcademicGradeApi {
  id: number
  avaliacaoId: number
  matricula: string
  nota: number
  observacao: string | null
  lancadoEm: string
  atualizadoEm: string
}

export interface AcademicDocumentApi {
  id: number
  matricula: string
  tipo: string
  titulo: string
  descricao: string | null
  periodo: number | null
  referenciaExterna: string | null
  status: 'DISPONIVEL' | 'ARQUIVADO'
  criadoEm: string
  atualizadoEm: string
}

export interface AcademicRequestApi {
  id: number
  matricula: string
  tipo: string
  descricao: string | null
  periodo: number | null
  status: 'ABERTO' | 'EM_ANALISE' | 'CONCLUIDO' | 'INDEFERIDO'
  criadoEm: string
  atualizadoEm: string
}

export interface AcademicLifeOverviewApi {
  period: number
  currentPeriodName: string
  periodOptions: string[]
  scopeLabel: string
  subjects: Array<{
    diarioId: number
    nome: string
    curso: string
    turma: string
    status: 'aberto' | 'fechado'
  }>
  calendars: AcademicCalendarApi[]
  calendarEvents: AcademicCalendarEventApi[]
  diaries: AcademicDiaryApi[]
  diaryEnrollments: AcademicDiaryEnrollmentApi[]
  classSessions: AcademicLessonApi[]
  attendance: AcademicAttendanceApi[]
  attendanceSummaries: AcademicAttendanceSummaryApi[]
  assessments: AcademicAssessmentApi[]
  grades: AcademicGradeApi[]
  documents: AcademicDocumentApi[]
  requests: AcademicRequestApi[]
  privacy: string
}

export interface CreateAcademicDiaryPayload {
  curso: string
  turma: string
  disciplina: string
  periodo: number
  professorUsuarioId: number
  matriculas?: string[]
}

export interface UpdateAcademicDiaryPayload {
  curso?: string
  turma?: string
  disciplina?: string
  periodo?: number
  professorUsuarioId?: number
  status?: 'aberto' | 'fechado'
}

export interface EnrollAcademicStudentsPayload {
  matriculas: string[]
}

export interface CreateAcademicCalendarPayload {
  titulo: string
  curso: string
  turma?: string | null
  periodo: number
  inicioEm: string
  fimEm: string
  ativo?: boolean
}

export type UpdateAcademicCalendarPayload = Partial<CreateAcademicCalendarPayload>

export interface CreateAcademicCalendarEventPayload {
  titulo: string
  descricao?: string | null
  tipo: AcademicCalendarEventApi['tipo']
  inicioEm: string
  fimEm: string
}

export interface UpdateAcademicCalendarEventPayload extends Partial<CreateAcademicCalendarEventPayload> {
  visivelParaAlunos?: boolean
}

export interface CreateAcademicLessonPayload {
  dataAula: string
  titulo: string
  conteudo?: string | null
  cargaHoraria?: number
}

export type UpdateAcademicLessonPayload = Partial<CreateAcademicLessonPayload>

export interface SetAcademicAttendancePayload {
  situacao: 'PRESENTE' | 'FALTA' | 'JUSTIFICADA'
  observacao?: string | null
}

export interface SetAcademicGradePayload {
  nota: number
  observacao?: string | null
}

export interface CreateAcademicAssessmentPayload {
  titulo: string
  descricao?: string | null
  dataAvaliacao: string
  peso?: number
  notaMaxima?: number
}

export type UpdateAcademicAssessmentPayload = Partial<CreateAcademicAssessmentPayload>

export interface CreateAcademicRequestPayload {
  matricula?: string
  tipo: string
  descricao?: string | null
  periodo?: number
}

export interface UpdateAcademicRequestPayload {
  status: AcademicRequestApi['status']
  descricao?: string | null
}

export interface CreateAcademicDocumentPayload {
  matricula: string
  tipo: string
  titulo: string
  descricao?: string | null
  periodo?: number | null
  referenciaExterna?: string | null
}

export interface UpdateAcademicDocumentPayload {
  tipo?: string
  titulo?: string
  descricao?: string | null
  periodo?: number | null
  referenciaExterna?: string | null
  status?: AcademicDocumentApi['status']
}

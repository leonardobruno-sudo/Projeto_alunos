/** Papel de `api`: transforma, valida ou transporta dados entre a interface e os formatos usados pela API ou por arquivos exportados.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

/**
 * Cliente HTTP da interface: encaminha chamadas `/api` ao servidor de mesma origem.
 * Mantém o cookie de sessão, interpreta o envelope JSON e converte falhas em
 * erros que páginas e componentes conseguem mostrar à pessoa usuária.
 * Autenticação, validação e autorização continuam sob responsabilidade da API.
 */

import type {
  ApiResult,
  AcademicHistorySaveResult,
  ChatResponse,
  InitialStudentCredentials,
  StatisticsData,
  StatisticsFilters,
  Student,
  StudentDetailData,
  StudentCreateData,
  StudentFilters,
  StudentImportResult,
  StudentListData,
  StudentMovePayload,
  StudentPayload,
  ProfessorSubjectPayload,
  SubjectData,
  User,
  UserCreatePayload,
  UserUpdatePayload,
} from '../types'
import type {
  AcademicAssessmentApi,
  AcademicAttendanceApi,
  AcademicCalendarApi,
  AcademicCalendarEventApi,
  AcademicDiaryApi,
  AcademicDiaryEnrollmentApi,
  AcademicDocumentApi,
  AcademicLifeOverviewApi,
  AcademicProfessorApi,
  AcademicGradeApi,
  AcademicLessonApi,
  CreateAcademicCalendarEventPayload,
  CreateAcademicCalendarPayload,
  CreateAcademicAssessmentPayload,
  CreateAcademicDocumentPayload,
  CreateAcademicDiaryPayload,
  CreateAcademicLessonPayload,
  CreateAcademicRequestPayload,
  EnrollAcademicStudentsPayload,
  SetAcademicAttendancePayload,
  SetAcademicGradePayload,
  UpdateAcademicAssessmentPayload,
  UpdateAcademicCalendarEventPayload,
  UpdateAcademicCalendarPayload,
  UpdateAcademicDocumentPayload,
  UpdateAcademicDiaryPayload,
  UpdateAcademicLessonPayload,
  UpdateAcademicRequestPayload,
  AcademicRequestApi,
} from '../features/academics/academicApiTypes'

interface ApiEnvelope<T> {
  success: boolean
  data: T
  message?: string
  error?: {
    code?: string
    message?: string
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function queryString(filters: object): string {
  const query = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if ((typeof value === 'string' || typeof value === 'number') && value !== '') {
      query.set(key, String(value))
    }
  })

  const value = query.toString()
  return value ? `?${value}` : ''
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { body, headers, ...init } = options
  const isFormData = body instanceof FormData
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  })

  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null
  const message = envelope?.error?.message ?? envelope?.message ?? 'Não foi possível concluir a solicitação.'

  if (!response.ok || !envelope?.success) {
    throw new ApiError(message, response.status, envelope?.error?.code)
  }

  return {
    data: envelope.data,
    message: envelope.message ?? '',
  }
}

function userFrom(data: User | { user: User; capabilities?: User['capabilities'] }): User {
  if (!('user' in data)) return data
  return {
    ...data.user,
    capabilities: data.capabilities ?? data.user.capabilities,
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

export const api = {
  getResearchSummary(): Promise<ApiResult<{
    profileCount: number
    statusCounts: Array<{ label: string; value: number }>
    cohorts: Array<{ year: number; total: number; desvinculados: number }>
    consentedSurveys: number
    interviews: Array<{ label: string; value: number }>
    models: Array<{ id: number; model_name: string; version: string; status: string; variables: unknown[]; metrics: Record<string, unknown>; criado_em: string }>
    activity: Array<{ id: number; operation: string; description: string; record_count: number; actor: string; criado_em: string }>
  }>> {
    return request('/api/pesquisa/resumo')
  },

  getResearchReportData(): Promise<ApiResult<{
    profileCount: number
    statusCounts: Array<{ label: string; value: number }>
    cohorts: Array<{ year: number; total: number; desvinculados: number }>
    consentedSurveys: number
    interviews: Array<{ label: string; value: number }>
    models: Array<{ id: number; model_name: string; version: string; status: string; variables: unknown[]; metrics: Record<string, unknown>; criado_em: string }>
    activity: Array<{ id: number; operation: string; description: string; record_count: number; actor: string; criado_em: string }>
  }>> {
    return request('/api/pesquisa/relatorio', { method: 'POST', body: {} })
  },

  importResearchProfiles(records: unknown[]): Promise<ApiResult<{ imported: number }>> {
    return request('/api/pesquisa/perfis/importar', { method: 'POST', body: { records } })
  },

  createResearchModel(payload: { nome: string; versao: string; variaveis: unknown[]; metricas: Record<string, unknown>; status: string }): Promise<ApiResult<{ id: number }>> {
    return request('/api/pesquisa/modelos', { method: 'POST', body: payload })
  },

  exportResearchData(): Promise<ApiResult<Record<string, unknown>>> {
    return request('/api/pesquisa/exportacao')
  },

  async login(username: string, password: string): Promise<ApiResult<User>> {
    const result = await request<User | { user: User; capabilities?: User['capabilities'] }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    })
    return { ...result, data: userFrom(result.data) }
  },

  async getCurrentUser(): Promise<ApiResult<User>> {
    const result = await request<User | { user: User; capabilities?: User['capabilities'] }>('/api/auth/me')
    return { ...result, data: userFrom(result.data) }
  },

  logout(): Promise<ApiResult<null>> {
    return request<null>('/api/auth/logout', { method: 'POST' })
  },

  async changePassword(payload: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<ApiResult<User>> {
    const result = await request<User | { user: User; capabilities?: User['capabilities'] }>('/api/auth/password', {
      method: 'POST',
      body: payload,
    })
    return { ...result, data: userFrom(result.data) }
  },

  async uploadProfilePhoto(file: File): Promise<ApiResult<User>> {
    const formData = new FormData()
    formData.append('foto', file)
    const result = await request<User | { user: User; capabilities?: User['capabilities'] }>('/api/auth/profile/photo', {
      method: 'PUT',
      body: formData,
    })
    return { ...result, data: userFrom(result.data) }
  },

  async removeProfilePhoto(): Promise<ApiResult<User>> {
    const result = await request<User | { user: User; capabilities?: User['capabilities'] }>('/api/auth/profile/photo', {
      method: 'DELETE',
    })
    return { ...result, data: userFrom(result.data) }
  },

  getStudents(
    filters: StudentFilters = {},
    options: Pick<RequestOptions, 'signal'> = {},
  ): Promise<ApiResult<StudentListData | Student[]>> {
    return request<StudentListData | Student[]>(`/api/alunos${queryString(filters)}`, options)
  },

  getStudent(
    matricula: string,
    filters: Pick<StudentFilters, 'periodo' | 'fonte'> = {},
    options: Pick<RequestOptions, 'signal'> = {},
  ): Promise<ApiResult<StudentDetailData>> {
    return request<StudentDetailData>(`/api/alunos/${encodeURIComponent(matricula)}${queryString(filters)}`, options)
  },

  getEditableStudent(matricula: string): Promise<ApiResult<{ aluno: Student }>> {
    return request<{ aluno: Student }>(`/api/alunos/${encodeURIComponent(matricula)}/edicao`)
  },

  getStatistics(filters: StatisticsFilters = {}): Promise<ApiResult<StatisticsData>> {
    return request<StatisticsData>(`/api/estatisticas${queryString(filters)}`)
  },

  getAcademicLife(periodo = 0): Promise<ApiResult<AcademicLifeOverviewApi>> {
    return request<AcademicLifeOverviewApi>(`/api/vida-academica${queryString({ periodo })}`)
  },

  getAcademicAssignableProfessors(): Promise<ApiResult<AcademicProfessorApi[]>> {
    return request<AcademicProfessorApi[]>('/api/vida-academica/professores')
  },

  createAcademicCalendar(payload: CreateAcademicCalendarPayload): Promise<ApiResult<AcademicCalendarApi>> {
    return request<AcademicCalendarApi>('/api/vida-academica/calendarios', { method: 'POST', body: payload })
  },

  updateAcademicCalendar(calendarId: number, payload: UpdateAcademicCalendarPayload): Promise<ApiResult<AcademicCalendarApi>> {
    return request<AcademicCalendarApi>(`/api/vida-academica/calendarios/${calendarId}`, { method: 'PATCH', body: payload })
  },

  deleteAcademicCalendar(calendarId: number): Promise<ApiResult<null>> {
    return request<null>(`/api/vida-academica/calendarios/${calendarId}`, { method: 'DELETE' })
  },

  createAcademicCalendarEvent(
    calendarId: number,
    payload: CreateAcademicCalendarEventPayload,
  ): Promise<ApiResult<AcademicCalendarEventApi>> {
    return request<AcademicCalendarEventApi>(`/api/vida-academica/calendarios/${calendarId}/eventos`, { method: 'POST', body: payload })
  },

  updateAcademicCalendarEvent(eventId: number, payload: UpdateAcademicCalendarEventPayload): Promise<ApiResult<AcademicCalendarEventApi>> {
    return request<AcademicCalendarEventApi>(`/api/vida-academica/eventos/${eventId}`, { method: 'PATCH', body: payload })
  },

  deleteAcademicCalendarEvent(eventId: number): Promise<ApiResult<null>> {
    return request<null>(`/api/vida-academica/eventos/${eventId}`, { method: 'DELETE' })
  },

  createAcademicDiary(payload: CreateAcademicDiaryPayload): Promise<ApiResult<AcademicDiaryApi>> {
    return request<AcademicDiaryApi>('/api/vida-academica/diarios', { method: 'POST', body: payload })
  },

  updateAcademicDiary(diaryId: number, payload: UpdateAcademicDiaryPayload): Promise<ApiResult<AcademicDiaryApi>> {
    return request<AcademicDiaryApi>(`/api/vida-academica/diarios/${diaryId}`, { method: 'PATCH', body: payload })
  },

  enrollAcademicStudents(diaryId: number, payload: EnrollAcademicStudentsPayload): Promise<ApiResult<AcademicDiaryEnrollmentApi[]>> {
    return request<AcademicDiaryEnrollmentApi[]>(`/api/vida-academica/diarios/${diaryId}/matriculas`, { method: 'POST', body: payload })
  },

  createAcademicLesson(diaryId: number, payload: CreateAcademicLessonPayload): Promise<ApiResult<AcademicLessonApi>> {
    return request<AcademicLessonApi>(`/api/vida-academica/diarios/${diaryId}/aulas`, { method: 'POST', body: payload })
  },

  updateAcademicLesson(lessonId: number, payload: UpdateAcademicLessonPayload): Promise<ApiResult<AcademicLessonApi>> {
    return request<AcademicLessonApi>(`/api/vida-academica/aulas/${lessonId}`, { method: 'PATCH', body: payload })
  },

  deleteAcademicLesson(lessonId: number): Promise<ApiResult<null>> {
    return request<null>(`/api/vida-academica/aulas/${lessonId}`, { method: 'DELETE' })
  },

  setAcademicAttendance(
    lessonId: number,
    matricula: string,
    payload: SetAcademicAttendancePayload,
  ): Promise<ApiResult<AcademicAttendanceApi>> {
    return request<AcademicAttendanceApi>(
      `/api/vida-academica/aulas/${lessonId}/frequencias/${encodeURIComponent(matricula)}`,
      { method: 'PUT', body: payload },
    )
  },

  setAcademicGrade(
    assessmentId: number,
    matricula: string,
    payload: SetAcademicGradePayload,
  ): Promise<ApiResult<AcademicGradeApi>> {
    return request<AcademicGradeApi>(
      `/api/vida-academica/avaliacoes/${assessmentId}/notas/${encodeURIComponent(matricula)}`,
      { method: 'PUT', body: payload },
    )
  },

  createAcademicAssessment(diaryId: number, payload: CreateAcademicAssessmentPayload): Promise<ApiResult<AcademicAssessmentApi>> {
    return request<AcademicAssessmentApi>(`/api/vida-academica/diarios/${diaryId}/avaliacoes`, { method: 'POST', body: payload })
  },

  updateAcademicAssessment(assessmentId: number, payload: UpdateAcademicAssessmentPayload): Promise<ApiResult<AcademicAssessmentApi>> {
    return request<AcademicAssessmentApi>(`/api/vida-academica/avaliacoes/${assessmentId}`, { method: 'PATCH', body: payload })
  },

  deleteAcademicAssessment(assessmentId: number): Promise<ApiResult<null>> {
    return request<null>(`/api/vida-academica/avaliacoes/${assessmentId}`, { method: 'DELETE' })
  },

  createAcademicRequest(payload: CreateAcademicRequestPayload): Promise<ApiResult<AcademicRequestApi>> {
    return request<AcademicRequestApi>('/api/vida-academica/requerimentos', { method: 'POST', body: payload })
  },

  updateAcademicRequest(requestId: number, payload: UpdateAcademicRequestPayload): Promise<ApiResult<AcademicRequestApi>> {
    return request<AcademicRequestApi>(`/api/vida-academica/requerimentos/${requestId}`, { method: 'PATCH', body: payload })
  },

  deleteAcademicRequest(requestId: number): Promise<ApiResult<null>> {
    return request<null>(`/api/vida-academica/requerimentos/${requestId}`, { method: 'DELETE' })
  },

  createAcademicDocument(payload: CreateAcademicDocumentPayload): Promise<ApiResult<AcademicDocumentApi>> {
    return request<AcademicDocumentApi>('/api/vida-academica/documentos', { method: 'POST', body: payload })
  },

  updateAcademicDocument(documentId: number, payload: UpdateAcademicDocumentPayload): Promise<ApiResult<AcademicDocumentApi>> {
    return request<AcademicDocumentApi>(`/api/vida-academica/documentos/${documentId}`, { method: 'PATCH', body: payload })
  },

  archiveAcademicDocument(documentId: number): Promise<ApiResult<null>> {
    return request<null>(`/api/vida-academica/documentos/${documentId}`, { method: 'DELETE' })
  },

  saveAcademicHistory(periodIndex: number, overwrite = false): Promise<ApiResult<AcademicHistorySaveResult>> {
    return request<AcademicHistorySaveResult>(`/api/periodos/${periodIndex}/historico`, {
      method: 'POST',
      body: { overwrite },
    })
  },

  createStudent(payload: StudentPayload): Promise<ApiResult<StudentCreateData>> {
    return request<StudentCreateData>('/api/alunos', { method: 'POST', body: payload })
  },

  async downloadStudentTemplate(): Promise<void> {
    const response = await fetch('/api/alunos/modelo.csv', {
      credentials: 'include',
      headers: { Accept: 'text/csv, application/json' },
    })

    if (!response.ok) {
      const envelope = (await response.json().catch(() => null)) as ApiEnvelope<unknown> | null
      const message = envelope?.error?.message ?? envelope?.message ?? 'Não foi possível baixar o modelo de importação.'
      throw new ApiError(message, response.status, envelope?.error?.code)
    }

    const contentDisposition = response.headers.get('content-disposition')
    const filename = contentDisposition?.match(/filename\*?=(?:UTF-8''|")?([^;"]+)/i)?.[1]?.trim() || 'modelo-alunos.csv'
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = decodeURIComponent(filename)
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },

  importStudents(file: File): Promise<ApiResult<StudentImportResult>> {
    const formData = new FormData()
    formData.append('arquivo', file)
    return request<StudentImportResult>('/api/alunos/importar', { method: 'POST', body: formData })
  },

  updateStudent(matricula: string, payload: Partial<StudentPayload>): Promise<ApiResult<Student | { aluno: Student }>> {
    return request<Student | { aluno: Student }>(`/api/alunos/${encodeURIComponent(matricula)}`, { method: 'PUT', body: payload })
  },

  updateProfessorSubject(
    matricula: string,
    subject: string,
    payload: ProfessorSubjectPayload,
  ): Promise<ApiResult<Student | { aluno: Student }>> {
    return request<Student | { aluno: Student }>(
      `/api/alunos/${encodeURIComponent(matricula)}/materias/${encodeURIComponent(subject)}`,
      { method: 'PATCH', body: payload },
    )
  },

  deleteStudent(matricula: string): Promise<ApiResult<null>> {
    return request<null>(`/api/alunos/${encodeURIComponent(matricula)}`, { method: 'DELETE' })
  },

  resetStudentCredentials(matricula: string): Promise<ApiResult<{ credenciaisIniciais: InitialStudentCredentials }>> {
    return request<{ credenciaisIniciais: InitialStudentCredentials }>(
      `/api/alunos/${encodeURIComponent(matricula)}/credenciais/redefinir`,
      { method: 'POST' },
    )
  },

  moveStudent(matricula: string, payload: StudentMovePayload): Promise<ApiResult<Student | { aluno: Student }>> {
    return request<Student | { aluno: Student }>(`/api/alunos/${encodeURIComponent(matricula)}/movimentacao`, {
      method: 'PATCH',
      body: payload,
    })
  },

  getTurmaSubjects(turma: string): Promise<ApiResult<string[]>> {
    return request<string[]>(`/api/turma-materias${queryString({ turma })}`)
  },

  getSubject(
    index: number,
    filters: StudentFilters = {},
    options: Pick<RequestOptions, 'signal'> = {},
  ): Promise<ApiResult<SubjectData>> {
    return request<SubjectData>(`/api/materia/${index}${queryString(filters)}`, options)
  },

  getUsers(): Promise<ApiResult<User[] | { users: User[] }>> {
    return request<User[] | { users: User[] }>('/api/usuarios')
  },

  async createUser(payload: UserCreatePayload): Promise<ApiResult<User>> {
    const result = await request<{ user: User }>('/api/usuarios', { method: 'POST', body: payload })
    return { ...result, data: result.data.user }
  },

  async updateUser(id: number, payload: UserUpdatePayload): Promise<ApiResult<User>> {
    const result = await request<{ user: User }>(`/api/usuarios/${id}`, { method: 'PUT', body: payload })
    return { ...result, data: result.data.user }
  },

  deleteUser(id: number): Promise<ApiResult<null>> {
    return request<null>(`/api/usuarios/${id}`, { method: 'DELETE' })
  },

  createBackup(): Promise<ApiResult<null>> {
    return request<null>('/api/backup', { method: 'POST' })
  },

  chat(message: string, contextMessage?: string, options: Pick<RequestOptions, 'signal'> = {}): Promise<ApiResult<ChatResponse>> {
    return request<ChatResponse>('/api/chat', {
      ...options,
      method: 'POST',
      body: { message, ...(contextMessage ? { contextMessage } : {}) },
    })
  },
}

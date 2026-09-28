/** Same-origin HTTP client used by the React interface to call the API. */

import type {
  ApiResult,
  AcademicHistorySaveResult,
  ChatResponse,
  StatisticsData,
  StatisticsFilters,
  Student,
  StudentDetailData,
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

  changePassword(payload: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<ApiResult<null>> {
    return request<null>('/api/auth/password', { method: 'POST', body: payload })
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

  saveAcademicHistory(periodIndex: number, overwrite = false): Promise<ApiResult<AcademicHistorySaveResult>> {
    return request<AcademicHistorySaveResult>(`/api/periodos/${periodIndex}/historico`, {
      method: 'POST',
      body: { overwrite },
    })
  },

  createStudent(payload: StudentPayload): Promise<ApiResult<Student | { aluno: Student }>> {
    return request<Student | { aluno: Student }>('/api/alunos', { method: 'POST', body: payload })
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

  chat(message: string, options: Pick<RequestOptions, 'signal'> = {}): Promise<ApiResult<ChatResponse>> {
    return request<ChatResponse>('/api/chat', { ...options, method: 'POST', body: { message } })
  },
}

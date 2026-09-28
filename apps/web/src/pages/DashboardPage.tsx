/** Visão geral com busca paginada, escopo aplicado no servidor e edição pontual. */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { DataSourceNotice, DataSourceSelector } from '../components/DataSourceControls'
import { StudentEditor } from '../components/StudentEditor'
import { StudentTable } from '../components/StudentTable'
import { QUOTA_OPTIONS } from '../constants/quotas'
import { toStudentListDto, type StudentListDto } from '../features/students/student.dto'
import { DEFAULT_PERIODS, canManageStudents, type Student, type StudentFilters, type StudentPayload, type User } from '../types'
import { api } from '../utils/api'

interface DashboardPageProps {
  user: User
  onMessage: (message: string) => void
  onError: (error: unknown) => string
}

const initialFilters: StudentFilters = {
  q: '',
  periodo: 0,
  fonte: 'atual',
  situacao: '',
  page: 1,
  pageSize: 20,
  sort: 'nome',
  direction: 'asc',
}

const emptyList = toStudentListDto([])

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function DashboardPage({ user, onMessage, onError }: DashboardPageProps) {
  const [filters, setFilters] = useState<StudentFilters>(initialFilters)
  const [list, setList] = useState<StudentListDto>(emptyList)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [openingStudent, setOpeningStudent] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const requestVersion = useRef(0)
  const isStudent = user.role === 'Aluno'
  const isHistorical = list.dataSource === 'historico'

  const reload = useCallback(() => setRefreshVersion((version) => version + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const version = ++requestVersion.current
    const delay = filters.q?.trim() ? 350 : 0

    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      void api.getStudents(filters, { signal: controller.signal })
        .then((result) => {
          if (version !== requestVersion.current) return
          setList(toStudentListDto(result.data))
        })
        .catch((requestError: unknown) => {
          if (version !== requestVersion.current || isAbortError(requestError)) return
          setError(onError(requestError))
        })
        .finally(() => {
          if (version === requestVersion.current) setLoading(false)
        })
    }, delay)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [filters, onError, refreshVersion])

  const periods = list.periodOptions.length > 0 ? list.periodOptions : DEFAULT_PERIODS

  function updateFilter(field: keyof StudentFilters, value: StudentFilters[keyof StudentFilters]) {
    setFilters((current) => ({ ...current, [field]: value, page: field === 'page' ? value as number : 1 }))
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    reload()
  }

  function resetFilters() {
    setFilters((current) => ({ ...initialFilters, periodo: current.periodo, pageSize: current.pageSize }))
  }

  function choosePeriod(index: number) {
    setFilters((current) => ({ ...current, periodo: index, page: 1 }))
  }

  function goToPage(page: number) {
    setFilters((current) => ({ ...current, page }))
  }

  async function deleteStudent(student: Student) {
    if (isHistorical) {
      setError('O histórico fechado é somente para consulta. Selecione Dados atuais para editar ou excluir um aluno.')
      return
    }
    if (!window.confirm(`Excluir o aluno ${student.nome}? Esta ação não pode ser desfeita.`)) return

    try {
      const result = await api.deleteStudent(student.matricula)
      onMessage(result.message || 'Aluno excluído com sucesso.')
      reload()
    } catch (requestError) {
      setError(onError(requestError))
    }
  }

  async function openStudentEditor(student: Student) {
    if (isHistorical) {
      setError('O histórico fechado é somente para consulta. Selecione Dados atuais para editar um aluno.')
      return
    }
    setOpeningStudent(student.matricula)
    setError('')
    try {
      const result = await api.getEditableStudent(student.matricula)
      setEditingStudent(result.data.aluno)
    } catch (requestError) {
      setError(onError(requestError))
    } finally {
      setOpeningStudent('')
    }
  }

  async function saveStudent(payload: StudentPayload): Promise<string> {
    if (!editingStudent) return ''
    if (isHistorical) throw new Error('O histórico fechado é somente para consulta.')

    try {
      const result = await api.updateStudent(editingStudent.matricula, payload)
      const message = result.message || 'Aluno atualizado com sucesso.'
      onMessage(message)
      setEditingStudent(null)
      reload()
      return message
    } catch (requestError) {
      throw new Error(onError(requestError))
    }
  }

  async function loadTurmaSubjects(turma: string): Promise<string[]> {
    const result = await api.getTurmaSubjects(turma)
    return result.data
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Dashboard</h1>
          <p className="muted">
            {isStudent
              ? 'Acompanhe os seus indicadores acadêmicos.'
              : 'Busque apenas os alunos que seu perfil pode consultar.'}
          </p>
        </div>
        <button className="button button-secondary" onClick={reload} type="button">Atualizar dados</button>
      </div>

      {!isStudent && (
      <form className="student-search" onSubmit={submitFilters} role="search">
        <div className="student-search-main">
          <label className="student-search-query">
            Buscar alunos
            <input
              autoComplete="off"
              onChange={(event) => updateFilter('q', event.target.value)}
              placeholder="Nome ou matrícula"
              type="search"
              value={filters.q ?? ''}
            />
          </label>
          <label>
            Situação
            <select
              onChange={(event) => updateFilter('situacao', event.target.value as StudentFilters['situacao'])}
              value={filters.situacao ?? ''}
            >
              <option value="">Todas</option>
              <option value="risco">Em risco</option>
              <option value="alerta">Alerta</option>
              <option value="regular">Regular</option>
            </select>
          </label>
          <label>
            Ordenar por
            <select onChange={(event) => updateFilter('sort', event.target.value as StudentFilters['sort'])} value={filters.sort ?? 'nome'}>
              <option value="nome">Nome</option>
              <option value="matricula">Matrícula</option>
              <option value="situacao_risco">Situação</option>
              <option value="nota_final">Nota final</option>
              <option value="taxa_faltas">Faltas</option>
            </select>
          </label>
          <label>
            Direção
            <select onChange={(event) => updateFilter('direction', event.target.value as StudentFilters['direction'])} value={filters.direction ?? 'asc'}>
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          </label>
        </div>

        {user.role === 'Admin' && (
          <details className="student-search-advanced">
            <summary>Filtros avançados</summary>
            <div className="student-search-advanced-fields">
              <label>
                Curso
                <input onChange={(event) => updateFilter('curso', event.target.value)} placeholder="Ex.: Informática" value={filters.curso ?? ''} />
              </label>
              <label>
                Turma
                <input onChange={(event) => updateFilter('turma', event.target.value)} placeholder="Ex.: 1º A" value={filters.turma ?? ''} />
              </label>
              <label>
                Modalidade de cota
                <select onChange={(event) => updateFilter('cota', event.target.value)} value={filters.cota ?? ''}>
                  <option value="">Todas</option>
                  {QUOTA_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          </details>
        )}

        <div className="student-search-actions">
          <span aria-live="polite" className="student-search-feedback">
            {loading && list.alunos.length > 0 ? 'Atualizando resultados…' : 'A busca é aplicada automaticamente.'}
          </span>
          <button className="button button-secondary" onClick={resetFilters} type="button">Limpar filtros</button>
          <button className="button button-primary" type="submit">Buscar agora</button>
        </div>
      </form>
      )}

      <div className="data-source-toolbar">
        <DataSourceSelector
          id="dashboard-data-source"
          onChange={(fonte) => {
            setEditingStudent(null)
            updateFilter('fonte', fonte)
          }}
          value={filters.fonte ?? 'atual'}
        />
      </div>

      <div className="period-tabs" aria-label="Selecionar período">
        {periods.map((period, index) => (
          <button
            aria-pressed={filters.periodo === index}
            className={filters.periodo === index ? 'period-tab active' : 'period-tab'}
            key={period}
            onClick={() => choosePeriod(index)}
            type="button"
          >
            {period}
          </button>
        ))}
      </div>

      {!loading && <DataSourceNotice
        hasPeriodSnapshot={list.hasPeriodSnapshot}
        periodName={list.currentPeriodName || periods[filters.periodo ?? 0]}
        snapshotAt={list.snapshotAt}
        source={list.dataSource}
      />}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section aria-busy={loading} className="card">
        <div className="section-heading">
          <div>
            <h2>{isStudent ? 'Meu acompanhamento' : 'Alunos'}</h2>
            <p aria-live="polite" className="muted">
              {isStudent
                ? 'Seu registro acadêmico está disponível abaixo.'
                : `${list.total} registro(s) encontrado(s) · Página ${list.page} de ${list.totalPages}.${isHistorical ? ' Histórico fechado: somente consulta.' : ''}`}
            </p>
          </div>
          {!isStudent && (
            <label className="student-page-size">
              Por página
              <select onChange={(event) => updateFilter('pageSize', Number(event.target.value))} value={filters.pageSize ?? 20}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
          )}
        </div>
        {openingStudent && <p className="student-editor-loading" role="status">Abrindo o cadastro de {openingStudent}…</p>}
        <StudentTable
          canDelete={!isHistorical && canManageStudents(user)}
          canEdit={!isHistorical && canManageStudents(user)}
          loading={loading && list.alunos.length === 0}
          onDelete={deleteStudent}
          onEdit={(student) => void openStudentEditor(student)}
          students={list.alunos}
        />
        {!isStudent && list.totalPages > 1 && (
          <nav aria-label="Paginação de alunos" className="student-pagination">
            <button className="button button-secondary" disabled={!list.hasPreviousPage || loading} onClick={() => goToPage(list.page - 1)} type="button">Anterior</button>
            <span>Página {list.page} de {list.totalPages}</span>
            <button className="button button-secondary" disabled={!list.hasNextPage || loading} onClick={() => goToPage(list.page + 1)} type="button">Próxima</button>
          </nav>
        )}
      </section>

      {editingStudent && !isHistorical && (
        <StudentEditor
          contextMessage={list.hasPeriodSnapshot ? 'Você está editando dados atuais. O histórico fechado do período permanece somente para consulta.' : undefined}
          onClose={() => setEditingStudent(null)}
          onLoadTurmaSubjects={loadTurmaSubjects}
          onSave={saveStudent}
          student={editingStudent}
          userRole={user.role}
        />
      )}
    </section>
  )
}

/** Responsabilidade: consulta alunos por período e permite operações autorizadas nos dados atuais. */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { DataSourceNotice, DataSourceSelector } from '../components/DataSourceControls'
import { StudentEditor } from '../components/StudentEditor'
import { StudentTable } from '../components/StudentTable'
import { DEFAULT_PERIODS, canManageStudents, type Student, type StudentFilters, type StudentPayload, type User } from '../types'
import { academicSourceMetadata, type AcademicSourceMetadata } from '../utils/academicDataSource'
import { api } from '../utils/api'
import { getPeriodOptions, getStudents } from '../utils/students'

interface PeriodsPageProps {
  user: User
  onMessage: (message: string) => void
  onError: (error: unknown) => string
}

const initialFilters: StudentFilters = {
  busca_matricula: '',
  busca_nome: '',
  periodo: 0,
  fonte: 'atual',
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function PeriodsPage({ user, onMessage, onError }: PeriodsPageProps) {
  const [filters, setFilters] = useState<StudentFilters>(initialFilters)
  const [students, setStudents] = useState<Student[]>([])
  const [periods, setPeriods] = useState(DEFAULT_PERIODS)
  const [metadata, setMetadata] = useState<AcademicSourceMetadata>(() => academicSourceMetadata(undefined, initialFilters))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [openingStudent, setOpeningStudent] = useState('')
  const requestVersion = useRef(0)
  const requestController = useRef<AbortController | null>(null)
  const isHistorical = metadata.source === 'historico'

  const load = useCallback(async (nextFilters: StudentFilters) => {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    const requestId = ++requestVersion.current

    setLoading(true)
    setError('')
    try {
      const result = await api.getStudents(nextFilters, { signal: controller.signal })
      if (requestId !== requestVersion.current) return

      setStudents(getStudents(result.data))
      if (!Array.isArray(result.data)) {
        setPeriods(getPeriodOptions(result.data, DEFAULT_PERIODS))
        setMetadata(academicSourceMetadata(result.data, nextFilters))
      } else {
        setMetadata(academicSourceMetadata(undefined, nextFilters))
      }
    } catch (requestError) {
      if (requestId !== requestVersion.current || isAbortError(requestError)) return
      setError(onError(requestError))
    } finally {
      if (requestId === requestVersion.current) setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load(initialFilters)

    return () => {
      requestController.current?.abort()
    }
  }, [load])

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEditingStudent(null)
    void load(filters)
  }

  function choosePeriod(index: number) {
    const nextFilters = { ...filters, periodo: index }
    setFilters(nextFilters)
    setEditingStudent(null)
    void load(nextFilters)
  }

  function historicMutationError() {
    setError('O histórico fechado é somente para consulta. Selecione Dados atuais para editar ou excluir um aluno.')
  }

  async function deleteStudent(student: Student) {
    if (isHistorical) {
      historicMutationError()
      return
    }
    if (!window.confirm(`Excluir o aluno ${student.nome}? Esta ação não pode ser desfeita.`)) return

    try {
      const result = await api.deleteStudent(student.matricula)
      onMessage(result.message || 'Aluno excluído com sucesso.')
      await load(filters)
    } catch (requestError) {
      setError(onError(requestError))
    }
  }

  async function openStudentEditor(student: Student) {
    if (isHistorical) {
      historicMutationError()
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
      await load(filters)
      return message
    } catch (requestError) {
      throw new Error(onError(requestError))
    }
  }

  async function loadTurmaSubjects(turma: string): Promise<string[]> {
    const result = await api.getTurmaSubjects(turma)
    return result.data
  }

  const periodName = metadata.currentPeriodName || periods[metadata.periodIndex] || DEFAULT_PERIODS[0]
  const canChangeStudents = !isHistorical && canManageStudents(user)

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Análise acadêmica</p>
          <h1>Períodos</h1>
          <p className="muted">Alterne o período e a fonte para acompanhar a situação acadêmica dos alunos.</p>
        </div>
      </div>

      <div className="period-tabs" aria-label="Selecionar período">
        {periods.map((period, index) => (
          <button
            aria-pressed={filters.periodo === index}
            className={filters.periodo === index ? 'period-tab active' : 'period-tab'}
            disabled={loading}
            key={period}
            onClick={() => choosePeriod(index)}
            type="button"
          >
            {period}
          </button>
        ))}
      </div>

      <form className="filter-bar filter-bar-periods" onSubmit={submitFilters}>
        <label>
          Matrícula
          <input
            onChange={(event) => setFilters((current) => ({ ...current, busca_matricula: event.target.value }))}
            placeholder="Buscar matrícula"
            value={filters.busca_matricula ?? ''}
          />
        </label>
        <label>
          Nome
          <input
            onChange={(event) => setFilters((current) => ({ ...current, busca_nome: event.target.value }))}
            placeholder="Buscar nome"
            value={filters.busca_nome ?? ''}
          />
        </label>
        <DataSourceSelector
          id="periods-data-source"
          onChange={(fonte) => setFilters((current) => ({ ...current, fonte }))}
          value={filters.fonte ?? 'atual'}
        />
        <button className="button button-primary" type="submit">Aplicar filtros</button>
      </form>

      {!loading && <DataSourceNotice
        hasPeriodSnapshot={metadata.hasPeriodSnapshot}
        periodName={periodName}
        snapshotAt={metadata.snapshotAt}
        source={metadata.source}
      />}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>{periodName}</h2>
            <p className="muted">
              {students.length} aluno(s) visível(is) neste período.
              {isHistorical ? ' O histórico fechado não permite edição ou exclusão.' : ''}
            </p>
          </div>
        </div>
        <StudentTable
          canDelete={canChangeStudents}
          canEdit={canChangeStudents}
          editLabel="Editar cadastro atual"
          loading={loading}
          onDelete={deleteStudent}
          onEdit={(student) => void openStudentEditor(student)}
          students={students}
        />
        {openingStudent && <p className="student-editor-loading" role="status">Abrindo o cadastro de {openingStudent}…</p>}
      </section>

      {editingStudent && !isHistorical && (
        <StudentEditor
          contextMessage={metadata.hasPeriodSnapshot ? 'Você está editando dados atuais. O histórico fechado do período permanece somente para consulta.' : undefined}
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

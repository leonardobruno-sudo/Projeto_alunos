/** Responsabilidade: acompanha alunos e indicadores organizados por matéria. */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { DataSourceNotice, DataSourceSelector } from '../components/DataSourceControls'
import { ProfessorSubjectEditor } from '../components/ProfessorSubjectEditor'
import { StudentBulletinTable } from '../components/StudentBulletinTable'
import { StudentEditor } from '../components/StudentEditor'
import { StudentTable } from '../components/StudentTable'
import {
  DEFAULT_PERIODS,
  canEditAssignedSubject,
  canManageStudents,
  type ProfessorSubjectPayload,
  type Student,
  type StudentFilters,
  type StudentPayload,
  type User,
} from '../types'
import { ApiError, api } from '../utils/api'
import { academicSourceMetadata, type AcademicSourceMetadata } from '../utils/academicDataSource'
import { getPeriodOptions, getStudents, getSubjectNames } from '../utils/students'

interface SubjectsPageProps {
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

export function SubjectsPage(props: SubjectsPageProps) {
  return props.user.role === 'Aluno'
    ? <StudentSubjectsPage {...props} />
    : <StaffSubjectsPage {...props} />
}

function StudentSubjectsPage({ user, onError }: SubjectsPageProps) {
  const [filters, setFilters] = useState<Pick<StudentFilters, 'periodo' | 'fonte'>>({ periodo: 0, fonte: 'atual' })
  const [student, setStudent] = useState<Student | null>(null)
  const [periods, setPeriods] = useState(DEFAULT_PERIODS)
  const [metadata, setMetadata] = useState<AcademicSourceMetadata>(() => academicSourceMetadata(undefined, { periodo: 0, fonte: 'atual' }))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)
  const requestController = useRef<AbortController | null>(null)

  const loadBulletin = useCallback(async (nextFilters: Pick<StudentFilters, 'periodo' | 'fonte'>) => {
    const matricula = user.matricula?.trim()
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    const requestId = ++requestVersion.current

    setLoading(true)
    setError('')
    setStudent(null)

    if (!matricula) {
      setError('Não foi possível identificar sua matrícula para carregar o boletim.')
      setLoading(false)
      return
    }

    try {
      const result = await api.getStudent(matricula, nextFilters, { signal: controller.signal })
      if (requestId !== requestVersion.current) return

      const nextMetadata = academicSourceMetadata(result.data, nextFilters)
      setMetadata(nextMetadata)
      setPeriods(getPeriodOptions(result.data, DEFAULT_PERIODS))
      setStudent(result.data.aluno)
    } catch (requestError) {
      if (requestId !== requestVersion.current || isAbortError(requestError)) return
      setError(
        requestError instanceof ApiError && requestError.status === 404
          ? 'Nenhum boletim foi registrado para este período.'
          : onError(requestError),
      )
    } finally {
      if (requestId === requestVersion.current) setLoading(false)
    }
  }, [onError, user.matricula])

  useEffect(() => {
    void loadBulletin(filters)

    return () => {
      requestController.current?.abort()
    }
  }, [filters, loadBulletin])

  const periodName = metadata.currentPeriodName || periods[filters.periodo ?? 0] || DEFAULT_PERIODS[0]

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Meu acompanhamento acadêmico</p>
          <h1>Boletim</h1>
          <p className="muted">Consulte todas as suas matérias, notas e frequência em um único lugar.</p>
        </div>
        <button className="button button-secondary" disabled={loading} onClick={() => void loadBulletin(filters)} type="button">
          {loading ? 'Atualizando…' : 'Atualizar boletim'}
        </button>
      </div>

      <section aria-labelledby="bulletin-period-title" className="card bulletin-period-card">
        <div className="section-heading compact">
          <div>
            <h2 id="bulletin-period-title">Período letivo</h2>
            <p className="muted">Escolha o período e a fonte dos dados que deseja consultar.</p>
          </div>
          <DataSourceSelector
            id="student-bulletin-source"
            onChange={(fonte) => setFilters((current) => ({ ...current, fonte }))}
            value={filters.fonte ?? 'atual'}
          />
        </div>
        <div aria-label="Selecionar período do boletim" className="period-tabs" role="group">
          {periods.map((period, index) => (
            <button
              aria-pressed={filters.periodo === index}
              className={filters.periodo === index ? 'period-tab active' : 'period-tab'}
              key={period}
              onClick={() => setFilters((current) => ({ ...current, periodo: index }))}
              type="button"
            >
              {period}
            </button>
          ))}
        </div>
      </section>

      {!loading && <DataSourceNotice
        hasPeriodSnapshot={metadata.hasPeriodSnapshot}
        periodName={periodName}
        snapshotAt={metadata.snapshotAt}
        source={metadata.source}
      />}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {loading && <div className="loading-state" role="status">Carregando boletim...</div>}
      {!loading && !error && student && <StudentBulletinTable periodName={periodName} student={student} />}
    </section>
  )
}

function StaffSubjectsPage({ user, onMessage, onError }: SubjectsPageProps) {
  const [filters, setFilters] = useState<StudentFilters>(initialFilters)
  const [subjectNames, setSubjectNames] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [students, setStudents] = useState<Student[]>([])
  const [subjectTitle, setSubjectTitle] = useState('')
  const [metadata, setMetadata] = useState<AcademicSourceMetadata>(() => academicSourceMetadata(undefined, initialFilters))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [openingStudent, setOpeningStudent] = useState('')
  const requestVersion = useRef(0)
  const requestController = useRef<AbortController | null>(null)
  const isProfessor = canEditAssignedSubject(user)
  const isHistorical = metadata.source === 'historico'

  const load = useCallback(async (nextFilters: StudentFilters, requestedIndex: number) => {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    const requestId = ++requestVersion.current

    setLoading(true)
    setError('')
    try {
      const result = await api.getStudents(nextFilters, { signal: controller.signal })
      if (requestId !== requestVersion.current) return

      const listData = Array.isArray(result.data) ? undefined : result.data
      const names = Array.isArray(result.data)
        ? getSubjectNames(getStudents(result.data))
        : result.data.subjectNames ?? getSubjectNames(getStudents(result.data))

      setMetadata(academicSourceMetadata(listData, nextFilters))
      setSubjectNames(names)

      if (names.length === 0) {
        setStudents([])
        setSubjectTitle('')
        return
      }

      const index = Math.min(requestedIndex, names.length - 1)
      const subjectResult = await api.getSubject(index, nextFilters, { signal: controller.signal })
      if (requestId !== requestVersion.current) return

      setMetadata(academicSourceMetadata(subjectResult.data, nextFilters))
      setStudents(getStudents(subjectResult.data))
      setSubjectTitle(subjectResult.data.subject || names[index])
      setSelectedIndex(index)
    } catch (requestError) {
      if (requestId !== requestVersion.current || isAbortError(requestError)) return
      setError(onError(requestError))
    } finally {
      if (requestId === requestVersion.current) setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load(initialFilters, 0)

    return () => {
      requestController.current?.abort()
    }
  }, [load])

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEditingStudent(null)
    void load(filters, selectedIndex)
  }

  function selectSubject(index: number) {
    void load(filters, index)
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
      await load(filters, selectedIndex)
    } catch (requestError) {
      setError(onError(requestError))
    }
  }

  async function openStudentEditor(student: Student) {
    if (isHistorical) {
      historicMutationError()
      return
    }

    if (isProfessor) {
      setEditingStudent(student)
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
      await load(filters, selectedIndex)
      return message
    } catch (requestError) {
      throw new Error(onError(requestError))
    }
  }

  async function saveProfessorSubject(payload: ProfessorSubjectPayload): Promise<string> {
    if (!editingStudent) return ''
    if (isHistorical) throw new Error('O histórico fechado é somente para consulta.')

    try {
      const subject = subjectTitle || user.disciplina || ''
      const result = await api.updateProfessorSubject(editingStudent.matricula, subject, payload)
      const message = result.message || 'Matéria atualizada com sucesso.'
      onMessage(message)
      setEditingStudent(null)
      await load(filters, selectedIndex)
      return message
    } catch (requestError) {
      throw new Error(onError(requestError))
    }
  }

  async function loadTurmaSubjects(turma: string): Promise<string[]> {
    const result = await api.getTurmaSubjects(turma)
    return result.data
  }

  const periodName = metadata.currentPeriodName || DEFAULT_PERIODS[metadata.periodIndex] || DEFAULT_PERIODS[0]
  const canChangeStudents = !isHistorical && (isProfessor || canManageStudents(user))

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Acompanhamento por disciplina</p>
          <h1>Matérias</h1>
          <p className="muted">Consulte notas, faltas e alertas para cada matéria.</p>
        </div>
      </div>

      <form className="filter-bar filter-bar-wide" onSubmit={submitFilters}>
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
        <label>
          Período
          <select
            onChange={(event) => setFilters((current) => ({ ...current, periodo: Number(event.target.value) }))}
            value={filters.periodo ?? 0}
          >
            {DEFAULT_PERIODS.map((period, index) => <option key={period} value={index}>{period}</option>)}
          </select>
        </label>
        <DataSourceSelector
          id="subjects-data-source"
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
            <h2>{subjectTitle || 'Matérias disponíveis'}</h2>
            <p className="muted">
              {isHistorical
                ? 'Histórico fechado: esta visualização é somente para consulta.'
                : 'Selecione uma matéria para carregar os alunos correspondentes.'}
            </p>
          </div>
        </div>

        <div className="subject-tabs">
          {subjectNames.map((name, index) => (
            <button
              className={selectedIndex === index ? 'period-tab active' : 'period-tab'}
              disabled={loading}
              key={name}
              onClick={() => selectSubject(index)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>

        <StudentTable
          canDelete={!isHistorical && canManageStudents(user)}
          canEdit={canChangeStudents}
          editLabel={isProfessor ? 'Editar matéria' : 'Editar'}
          gradeLabel="Nota"
          absenceLabel="Faltas"
          emptyLabel={subjectNames.length === 0 ? 'Nenhuma matéria encontrada nos alunos visíveis.' : 'Nenhum aluno possui esta matéria para os filtros atuais.'}
          loading={loading}
          onDelete={deleteStudent}
          onEdit={(student) => void openStudentEditor(student)}
          students={students}
        />
        {openingStudent && <p className="student-editor-loading" role="status">Abrindo o cadastro de {openingStudent}…</p>}
      </section>

      {editingStudent && !isHistorical && (
        isProfessor ? (
          <ProfessorSubjectEditor
            key={`${editingStudent.matricula}-${subjectTitle}`}
            onClose={() => setEditingStudent(null)}
            onSave={saveProfessorSubject}
            student={editingStudent}
            subject={subjectTitle || user.disciplina || 'Matéria'}
          />
        ) : (
          <StudentEditor
            contextMessage={metadata.hasPeriodSnapshot ? 'Você está editando dados atuais. O histórico fechado do período permanece somente para consulta.' : undefined}
            onClose={() => setEditingStudent(null)}
            onLoadTurmaSubjects={loadTurmaSubjects}
            onSave={saveStudent}
            student={editingStudent}
            userRole={user.role}
          />
        )
      )}
    </section>
  )
}

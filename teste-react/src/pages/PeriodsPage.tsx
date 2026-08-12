/** Responsabilidade: consulta alunos por período e permite operações autorizadas. */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { StudentEditor } from '../components/StudentEditor'
import { StudentTable } from '../components/StudentTable'
import { DEFAULT_PERIODS, canManageStudents, type Student, type StudentFilters, type StudentPayload, type User } from '../types'
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
}

export function PeriodsPage({ user, onMessage, onError }: PeriodsPageProps) {
  const [filters, setFilters] = useState<StudentFilters>(initialFilters)
  const [students, setStudents] = useState<Student[]>([])
  const [periods, setPeriods] = useState(DEFAULT_PERIODS)
  const [periodIndex, setPeriodIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)

  const load = useCallback(async (nextFilters: StudentFilters) => {
    setLoading(true)
    setError('')
    try {
      const result = await api.getStudents(nextFilters)
      setStudents(getStudents(result.data))
      if (!Array.isArray(result.data)) {
        setPeriods(getPeriodOptions(result.data, DEFAULT_PERIODS))
        setPeriodIndex(result.data.periodIndex ?? Number(nextFilters.periodo ?? 0))
      }
    } catch (requestError) {
      setError(onError(requestError))
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load(initialFilters)
  }, [load])

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void load(filters)
  }

  function choosePeriod(index: number) {
    const nextFilters = { ...filters, periodo: index }
    setFilters(nextFilters)
    void load(nextFilters)
  }

  async function deleteStudent(student: Student) {
    if (!window.confirm(`Excluir o aluno ${student.nome}? Esta ação não pode ser desfeita.`)) return

    try {
      const result = await api.deleteStudent(student.matricula)
      onMessage(result.message || 'Aluno excluído com sucesso.')
      await load(filters)
    } catch (requestError) {
      setError(onError(requestError))
    }
  }

  async function saveStudent(payload: StudentPayload): Promise<string> {
    if (!editingStudent) return ''

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

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Análise acadêmica</p>
          <h1>Períodos</h1>
          <p className="muted">Alterne o período para acompanhar a situação acadêmica dos alunos.</p>
        </div>
      </div>

      <div className="period-tabs" aria-label="Selecionar período">
        {periods.map((period, index) => (
          <button
            className={periodIndex === index ? 'period-tab active' : 'period-tab'}
            key={period}
            onClick={() => choosePeriod(index)}
            type="button"
          >
            {period}
          </button>
        ))}
      </div>

      <form className="filter-bar" onSubmit={submitFilters}>
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
        <button className="button button-primary" type="submit">Aplicar filtros</button>
      </form>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>{periods[periodIndex] || 'Período selecionado'}</h2>
            <p className="muted">{students.length} aluno(s) visível(is) neste período.</p>
          </div>
        </div>
        <StudentTable
          canManageStudents={canManageStudents(user)}
          loading={loading}
          onDelete={deleteStudent}
          onEdit={setEditingStudent}
          students={students}
        />
      </section>

      {editingStudent && (
        <StudentEditor
          onClose={() => setEditingStudent(null)}
          onLoadTurmaSubjects={loadTurmaSubjects}
          onSave={saveStudent}
          student={editingStudent}
        />
      )}
    </section>
  )
}

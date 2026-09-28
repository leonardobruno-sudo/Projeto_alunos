/** Responsabilidade: mostra a visão geral de alunos, filtros e operações de gestão. */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { StudentEditor } from '../components/StudentEditor'
import { StudentTable } from '../components/StudentTable'
import type { Student, StudentFilters, StudentPayload, User } from '../types'
import { DEFAULT_PERIODS, canManageStudents } from '../types'
import { api } from '../utils/api'
import { getPeriodOptions, getStudents } from '../utils/students'

interface DashboardPageProps {
  user: User
  onMessage: (message: string) => void
  onError: (error: unknown) => string
}

const initialFilters: StudentFilters = {
  busca_matricula: '',
  busca_nome: '',
  periodo: 0,
}

export function DashboardPage({ user, onMessage, onError }: DashboardPageProps) {
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

  function updateFilter(field: keyof StudentFilters, value: string | number) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

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
          <p className="eyebrow">Visão geral</p>
          <h1>Dashboard</h1>
          <p className="muted">Acompanhe os alunos que você tem permissão para consultar.</p>
        </div>
        <button className="button button-secondary" onClick={() => void load(filters)} type="button">Atualizar dados</button>
      </div>

      <form className="filter-bar" onSubmit={submitFilters}>
        <label>
          Matrícula
          <input
            onChange={(event) => updateFilter('busca_matricula', event.target.value)}
            placeholder="Buscar matrícula"
            value={filters.busca_matricula ?? ''}
          />
        </label>
        <label>
          Nome
          <input
            onChange={(event) => updateFilter('busca_nome', event.target.value)}
            placeholder="Buscar nome"
            value={filters.busca_nome ?? ''}
          />
        </label>
        <button className="button button-primary" type="submit">Aplicar filtros</button>
      </form>

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

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Alunos</h2>
            <p className="muted">{students.length} registro(s) encontrado(s).</p>
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

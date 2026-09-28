/** Responsabilidade: acompanha alunos e indicadores organizados por matéria. */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { StudentEditor } from '../components/StudentEditor'
import { StudentTable } from '../components/StudentTable'
import { DEFAULT_PERIODS, canManageStudents, type Student, type StudentFilters, type StudentPayload, type User } from '../types'
import { api } from '../utils/api'
import { getStudents, getSubjectNames } from '../utils/students'

interface SubjectsPageProps {
  user: User
  onMessage: (message: string) => void
  onError: (error: unknown) => string
}

const initialFilters: StudentFilters = {
  busca_matricula: '',
  busca_nome: '',
  periodo: 0,
}

export function SubjectsPage({ user, onMessage, onError }: SubjectsPageProps) {
  const [filters, setFilters] = useState<StudentFilters>(initialFilters)
  const [subjectNames, setSubjectNames] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [students, setStudents] = useState<Student[]>([])
  const [subjectTitle, setSubjectTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)

  async function loadSubject(index: number, activeFilters: StudentFilters) {
    const result = await api.getSubject(index, activeFilters)
    setStudents(getStudents(result.data))
    setSubjectTitle(result.data.subject || subjectNames[index] || '')
    setSelectedIndex(index)
  }

  const load = useCallback(async (nextFilters: StudentFilters, requestedIndex: number) => {
    setLoading(true)
    setError('')
    try {
      const result = await api.getStudents(nextFilters)
      const names = getSubjectNames(getStudents(result.data))
      setSubjectNames(names)

      if (names.length === 0) {
        setStudents([])
        setSubjectTitle('')
        return
      }

      const index = Math.min(requestedIndex, names.length - 1)
      const subjectResult = await api.getSubject(index, nextFilters)
      setStudents(getStudents(subjectResult.data))
      setSubjectTitle(subjectResult.data.subject || names[index])
      setSelectedIndex(index)
    } catch (requestError) {
      setError(onError(requestError))
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load(initialFilters, 0)
  }, [load])

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void load(filters, selectedIndex)
  }

  async function selectSubject(index: number) {
    setLoading(true)
    setError('')
    try {
      await loadSubject(index, filters)
    } catch (requestError) {
      setError(onError(requestError))
    } finally {
      setLoading(false)
    }
  }

  async function deleteStudent(student: Student) {
    if (!window.confirm(`Excluir o aluno ${student.nome}? Esta ação não pode ser desfeita.`)) return

    try {
      const result = await api.deleteStudent(student.matricula)
      onMessage(result.message || 'Aluno excluído com sucesso.')
      await load(filters, selectedIndex)
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
        <button className="button button-primary" type="submit">Aplicar filtros</button>
      </form>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>{subjectTitle || 'Matérias disponíveis'}</h2>
            <p className="muted">Selecione uma matéria para carregar os alunos correspondentes.</p>
          </div>
        </div>

        <div className="subject-tabs">
          {subjectNames.map((name, index) => (
            <button
              className={selectedIndex === index ? 'period-tab active' : 'period-tab'}
              key={name}
              onClick={() => void selectSubject(index)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>

        <StudentTable
          canManageStudents={canManageStudents(user)}
          gradeLabel="Nota"
          absenceLabel="Faltas"
          emptyLabel={subjectNames.length === 0 ? 'Nenhuma matéria encontrada nos alunos visíveis.' : 'Nenhum aluno possui esta matéria para os filtros atuais.'}
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

/** Responsabilidade: apresenta a lista de alunos, suas descrições e as ações permitidas. */

import { useEffect, useRef, useState } from 'react'
import type { Student } from '../types'
import { getStudentStatus } from '../utils/students'

interface StudentTableProps {
  students: Student[]
  canManageStudents: boolean
  loading?: boolean
  emptyLabel?: string
  gradeLabel?: string
  absenceLabel?: string
  onEdit?: (student: Student) => void
  onDelete?: (student: Student) => void
}

function displayNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return String(value)
}

function statusClass(status: string): string {
  const normalized = status.toLocaleLowerCase('pt-BR')
  if (normalized.includes('risco')) return 'status risk'
  if (normalized.includes('alerta')) return 'status warning'
  return 'status regular'
}

function descriptionPreview(description: string): string {
  const normalized = description.replace(/\s+/g, ' ').trim()
  const maximumLength = 140

  return normalized.length > maximumLength
    ? `${normalized.slice(0, maximumLength).trimEnd()}...`
    : normalized
}

export function StudentTable({
  students,
  canManageStudents,
  loading = false,
  emptyLabel = 'Nenhum aluno encontrado para os filtros selecionados.',
  gradeLabel = 'Nota final',
  absenceLabel = 'Faltas (%)',
  onEdit,
  onDelete,
}: StudentTableProps) {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!selectedStudent) return undefined

    const previouslyFocused = document.activeElement
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedStudent(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [selectedStudent])

  if (loading) return <div className="loading-state">Carregando alunos...</div>
  if (students.length === 0) return <div className="empty-state">{emptyLabel}</div>

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Aluno</th>
            <th>Curso / turma</th>
            <th>{gradeLabel}</th>
            <th>{absenceLabel}</th>
            <th>Situação</th>
            {canManageStudents && <th className="actions-column">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => {
            const status = getStudentStatus(student)
            const description = student.descricao?.trim()
            const tooltipId = `student-description-preview-${student.matricula}`
            return (
              <tr key={student.matricula}>
                <td className="mono">{student.matricula}</td>
                <td>
                  {description ? (
                    <span className="student-description-trigger">
                      <a
                        aria-describedby={tooltipId}
                        aria-expanded={selectedStudent?.matricula === student.matricula}
                        aria-haspopup="dialog"
                        className="student-description-link"
                        href={`#descricao-${student.matricula}`}
                        onClick={(event) => {
                          event.preventDefault()
                          setSelectedStudent(student)
                        }}
                      >
                        {student.nome}
                      </a>
                      <span className="student-description-tooltip" id={tooltipId} role="tooltip">
                        {descriptionPreview(description)}
                      </span>
                    </span>
                  ) : (
                    <strong>{student.nome}</strong>
                  )}
                  {student.telefone && <span className="table-subtitle">{student.telefone}</span>}
                </td>
                <td>
                  <span>{student.curso || '—'}</span>
                  <span className="table-subtitle">{student.turma || 'Sem turma'}</span>
                </td>
                <td>{displayNumber(student.nota_final)}</td>
                <td>{displayNumber(student.taxa_faltas)}</td>
                <td><span className={statusClass(status)}>{status}</span></td>
                {canManageStudents && (
                  <td className="row-actions">
                    <button className="text-button" onClick={() => onEdit?.(student)} type="button">Editar</button>
                    <button className="text-button danger-text" onClick={() => onDelete?.(student)} type="button">Excluir</button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {selectedStudent?.descricao && (
        <div
          aria-label="Fechar descrição do aluno"
          className="modal-backdrop student-description-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedStudent(null)
          }}
          role="presentation"
        >
          <section
            aria-describedby="student-description-content"
            aria-labelledby="student-description-title"
            aria-modal="true"
            className="modal-card student-description-modal"
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Descrição do aluno</p>
                <h2 id="student-description-title">{selectedStudent.nome}</h2>
                <p className="muted">Matrícula: {selectedStudent.matricula}</p>
              </div>
              <button
                aria-label="Fechar descrição"
                className="icon-button"
                onClick={() => setSelectedStudent(null)}
                ref={closeButtonRef}
                type="button"
              >
                ×
              </button>
            </div>
            <p className="student-description-content" id="student-description-content">
              {selectedStudent.descricao}
            </p>
          </section>
        </div>
      )}
    </div>
  )
}

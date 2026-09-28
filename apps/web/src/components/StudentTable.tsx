/** Responsabilidade: apresenta a lista de alunos, suas descrições e as ações permitidas. */

import { useState } from 'react'
import type { Student } from '../types'
import { getStudentStatus } from '../utils/students'
import { useAccessibleDialog } from '../utils/useAccessibleDialog'

interface StudentTableProps {
  students: Student[]
  canEdit?: boolean
  canDelete?: boolean
  loading?: boolean
  emptyLabel?: string
  gradeLabel?: string
  absenceLabel?: string
  editLabel?: string
  onEdit?: (student: Student) => void
  onDelete?: (student: Student) => void
}

function displayNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return String(value)
}

type AcademicValueTone = 'normal' | 'risk' | 'unknown'

function academicValueTone(value: number | null | undefined, isAtRisk: boolean): AcademicValueTone {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'unknown'
  return isAtRisk ? 'risk' : 'normal'
}

function academicValueTitle(metric: 'grade' | 'absence', tone: AcademicValueTone): string {
  if (tone === 'unknown') return metric === 'grade' ? 'Nota indisponível' : 'Faltas indisponíveis'
  if (metric === 'grade') return tone === 'risk' ? 'Nota abaixo da média acadêmica' : 'Nota dentro da média acadêmica'
  return tone === 'risk' ? 'Faltas acima do limite acadêmico' : 'Faltas dentro do limite acadêmico'
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
  canEdit = false,
  canDelete = false,
  loading = false,
  emptyLabel = 'Nenhum aluno encontrado para os filtros selecionados.',
  gradeLabel = 'Nota final',
  absenceLabel = 'Faltas (%)',
  editLabel = 'Editar',
  onEdit,
  onDelete,
}: StudentTableProps) {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const dialogRef = useAccessibleDialog(Boolean(selectedStudent), () => setSelectedStudent(null))
  const canShowActions = canEdit || canDelete

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
            {canShowActions && <th className="actions-column">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => {
            const status = getStudentStatus(student)
            const gradeTone = academicValueTone(student.nota_final, student.risco_nota === true)
            const absenceTone = academicValueTone(student.taxa_faltas, student.risco_faltas === true)
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
                <td>
                  <span
                    aria-label={`${academicValueTitle('grade', gradeTone)}: ${displayNumber(student.nota_final)}`}
                    className={`student-academic-value student-academic-value--${gradeTone}`}
                    title={academicValueTitle('grade', gradeTone)}
                  >
                    {displayNumber(student.nota_final)}
                  </span>
                </td>
                <td>
                  <span
                    aria-label={`${academicValueTitle('absence', absenceTone)}: ${displayNumber(student.taxa_faltas)}`}
                    className={`student-academic-value student-academic-value--${absenceTone}`}
                    title={academicValueTitle('absence', absenceTone)}
                  >
                    {displayNumber(student.taxa_faltas)}
                  </span>
                </td>
                <td><span className={statusClass(status)}>{status}</span></td>
                {canShowActions && (
                  <td className="row-actions">
                    {canEdit && <button className="text-button" onClick={() => onEdit?.(student)} type="button">{editLabel}</button>}
                    {canDelete && <button className="text-button danger-text" onClick={() => onDelete?.(student)} type="button">Excluir</button>}
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
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
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

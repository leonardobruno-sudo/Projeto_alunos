/** Responsabilidade: apresenta o boletim individual do aluno por período. */

import type { Student, Subject } from '../types'
import { getStudentSubjects } from '../utils/students'

interface StudentBulletinTableProps {
  student: Student
  periodName: string
}

type AcademicValueTone = 'normal' | 'risk' | 'unknown'
type AcademicStatusSource = Pick<Subject, 'situacao_risco' | 'risco_nota' | 'risco_faltas' | 'alerta_nota' | 'alerta_faltas'>

function displayNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'

  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function displayPercentage(value: number | null | undefined): string {
  const number = Number(value)
  if (value === null || value === undefined || Number.isNaN(number)) return '—'

  return `${number.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function academicValueTone(value: number | null | undefined, isAtRisk: boolean): AcademicValueTone {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'unknown'
  return isAtRisk ? 'risk' : 'normal'
}

function academicValueTitle(metric: 'grade' | 'absence', tone: AcademicValueTone): string {
  if (tone === 'unknown') return metric === 'grade' ? 'Nota indisponível' : 'Faltas indisponíveis'
  if (metric === 'grade') return tone === 'risk' ? 'Nota abaixo da média acadêmica' : 'Nota dentro da média acadêmica'
  return tone === 'risk' ? 'Faltas acima do limite acadêmico' : 'Faltas dentro do limite acadêmico'
}

function subjectStatus(subject: AcademicStatusSource): string {
  const serverStatus = String(subject.situacao_risco ?? '').trim().toLocaleLowerCase('pt-BR')
  if (serverStatus.includes('risco') || subject.risco_nota || subject.risco_faltas) return 'Em risco'
  if (serverStatus.includes('alerta') || subject.alerta_nota || subject.alerta_faltas) return 'Alerta'
  return 'Regular'
}

function statusClass(status: string): string {
  const normalized = status.toLocaleLowerCase('pt-BR')
  if (normalized.includes('risco')) return 'status risk'
  if (normalized.includes('alerta')) return 'status warning'
  return 'status regular'
}

function absenceDescription(subject: Subject): string {
  const absences = displayNumber(subject.faltas)
  const totalClasses = Number(subject.total_aulas)

  return Number.isFinite(totalClasses) && totalClasses > 0
    ? `${absences} de ${displayNumber(totalClasses)} aulas`
    : absences
}

function attendancePercentage(subject: Subject): number | null {
  const absencePercentage = Number(subject.percentual_faltas)
  if (!Number.isFinite(absencePercentage)) return null
  return Math.min(100, Math.max(0, 100 - absencePercentage))
}

export function StudentBulletinTable({ student, periodName }: StudentBulletinTableProps) {
  const subjects = getStudentSubjects(student)

  if (subjects.length === 0) {
    return <div className="empty-state">Nenhuma matéria foi registrada para este período.</div>
  }

  return (
    <section aria-labelledby="student-bulletin-title" className="card student-bulletin-card">
      <div className="section-heading student-bulletin-heading">
        <div>
          <p className="eyebrow">Boletim individual</p>
          <h2 id="student-bulletin-title">{student.nome}</h2>
          <p className="muted">
            Matrícula {student.matricula}
            {student.curso ? ` · ${student.curso}` : ''}
            {student.turma ? ` · Turma ${student.turma}` : ''}
          </p>
        </div>
        <dl className="student-bulletin-summary" aria-label="Resumo acadêmico do período">
          <div>
            <dt>Nota geral</dt>
            <dd>{displayNumber(student.nota_final)}</dd>
          </div>
          <div>
            <dt>Faltas</dt>
            <dd>{displayPercentage(student.taxa_faltas)}</dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd><span className={statusClass(subjectStatus(student))}>{subjectStatus(student)}</span></dd>
          </div>
        </dl>
      </div>

      <div className="table-wrap">
        <table className="student-bulletin-table">
          <caption>Notas e frequência por matéria — {periodName}</caption>
          <thead>
            <tr>
              <th scope="col">Matéria</th>
              <th scope="col">Nota</th>
              <th scope="col">Faltas</th>
              <th scope="col">Justificadas</th>
              <th scope="col">Frequência</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => {
              const gradeTone = academicValueTone(subject.nota, subject.risco_nota === true)
              const absenceTone = academicValueTone(subject.faltas, subject.risco_faltas === true)
              const frequency = attendancePercentage(subject)
              const status = subjectStatus(subject)

              return (
                <tr key={subject.name}>
                  <th scope="row">{subject.name}</th>
                  <td>
                    <span
                      aria-label={`${academicValueTitle('grade', gradeTone)}: ${displayNumber(subject.nota)}`}
                      className={`student-academic-value student-academic-value--${gradeTone}`}
                      title={academicValueTitle('grade', gradeTone)}
                    >
                      {displayNumber(subject.nota)}
                    </span>
                  </td>
                  <td>
                    <span
                      aria-label={`${academicValueTitle('absence', absenceTone)}: ${absenceDescription(subject)}`}
                      className={`student-academic-value student-academic-value--${absenceTone}`}
                      title={academicValueTitle('absence', absenceTone)}
                    >
                      {absenceDescription(subject)}
                    </span>
                  </td>
                  <td>{displayNumber(subject.faltas_justificadas ?? subject.justificadas)}</td>
                  <td>
                    <span className={`student-academic-value student-academic-value--${absenceTone}`}>
                      {displayPercentage(frequency)}
                    </span>
                  </td>
                  <td><span className={statusClass(status)}>{status}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

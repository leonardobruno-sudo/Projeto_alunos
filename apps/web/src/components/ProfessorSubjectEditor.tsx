/** Editor deliberately limited to the one subject assigned to a professor. */

import { useId, useState, type FormEvent } from 'react'
import type { ProfessorSubjectPayload, Student, Subject } from '../types'
import { getStudentSubjects } from '../utils/students'
import { useAccessibleDialog } from '../utils/useAccessibleDialog'

interface ProfessorSubjectEditorProps {
  student: Student
  subject: string
  onClose: () => void
  onSave: (payload: ProfessorSubjectPayload) => Promise<string | void>
}

function subjectForEditor(student: Student): Subject {
  return getStudentSubjects(student)[0] ?? {
    name: '',
    nota: student.nota_final ?? 0,
    faltas: student.taxa_faltas ?? 0,
    faltas_justificadas: 0,
    total_aulas: student.total_aulas ?? 0,
  }
}

export function ProfessorSubjectEditor({ student, subject, onClose, onSave }: ProfessorSubjectEditorProps) {
  const titleId = useId()
  const dialogRef = useAccessibleDialog(true, onClose)
  const initial = subjectForEditor(student)
  const [nota, setNota] = useState(String(initial.nota ?? 0))
  const [faltas, setFaltas] = useState(String(initial.faltas ?? 0))
  const [faltasJustificadas, setFaltasJustificadas] = useState(String(initial.faltas_justificadas ?? initial.justificadas ?? 0))
  const [totalAulas, setTotalAulas] = useState(String(initial.total_aulas ?? 0))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const payload: ProfessorSubjectPayload = {
      nota: Number(nota),
      faltas: Number(faltas),
      faltas_justificadas: Number(faltasJustificadas),
      total_aulas: Number(totalAulas),
    }
    if (!Number.isFinite(payload.nota) || payload.nota < 0 || payload.nota > 100) {
      setError('A nota deve estar entre 0 e 100.')
      return
    }
    if (![payload.faltas, payload.faltas_justificadas, payload.total_aulas].every(Number.isInteger) ||
      payload.faltas < 0 || payload.faltas_justificadas < 0 || payload.total_aulas < 0 ||
      payload.faltas > payload.total_aulas ||
      payload.faltas_justificadas > Math.min(payload.faltas, payload.total_aulas)) {
      setError('Faltas não podem superar o total de aulas; justificadas não podem superar as faltas nem o total de aulas.')
      return
    }

    setSaving(true)
    try {
      await onSave(payload)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar a matéria.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby={titleId} aria-modal="true" className="modal-card" ref={dialogRef} role="dialog" tabIndex={-1}>
        <div className="modal-header">
          <div>
            <h2 id={titleId}>Editar {subject}</h2>
            <p className="muted">{student.nome} · {student.matricula}</p>
            <p className="muted student-editor-context">Você pode alterar somente nota e faltas da sua disciplina.</p>
          </div>
          <button aria-label="Fechar editor" className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="stack-form student-form" onSubmit={submit}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div className="form-grid">
            <label>
              Nota
              <input max={100} min={0} onChange={(event) => setNota(event.target.value)} required step="0.1" type="number" value={nota} />
            </label>
            <label>
              Faltas
              <input max={Number.isFinite(Number(totalAulas)) && Number(totalAulas) >= 0 ? Number(totalAulas) : undefined} min={0} onChange={(event) => setFaltas(event.target.value)} required step="1" type="number" value={faltas} />
            </label>
            <label>
              Faltas justificadas
              <input max={Number.isFinite(Number(faltas)) && Number.isFinite(Number(totalAulas)) && Number(faltas) >= 0 && Number(totalAulas) >= 0 ? Math.min(Number(faltas), Number(totalAulas)) : undefined} min={0} onChange={(event) => setFaltasJustificadas(event.target.value)} required step="1" type="number" value={faltasJustificadas} />
            </label>
            <label>
              Total de aulas
              <input min={0} onChange={(event) => setTotalAulas(event.target.value)} required step="1" type="number" value={totalAulas} />
            </label>
          </div>
          <div className="form-actions">
            <button className="button button-secondary" onClick={onClose} type="button">Cancelar</button>
            <button className="button button-primary" disabled={saving} type="submit">
              {saving ? 'Salvando...' : 'Salvar matéria'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

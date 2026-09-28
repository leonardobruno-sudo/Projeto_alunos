/** Responsabilidade: exibe o formulário modal para editar um aluno existente. */

import { useId } from 'react'
import type { Student, StudentPayload } from '../types'
import { useAccessibleDialog } from '../utils/useAccessibleDialog'
import { StudentForm } from './StudentForm'

interface StudentEditorProps {
  student: Student
  userRole: string
  onClose: () => void
  onSave: (payload: StudentPayload) => Promise<string | void>
  onLoadTurmaSubjects: (turma: string) => Promise<string[]>
  contextMessage?: string
}

function lockedScopeFieldsFor(role: string): Array<'curso' | 'disciplina' | 'turma'> {
  if (role === 'Professor') return ['curso', 'disciplina', 'turma']
  if (role === 'Diretor') return ['curso']
  return []
}

function scopeMessageFor(role: string): string | null {
  if (role === 'Professor') return 'Curso, disciplina e turma seguem o escopo do seu perfil e não podem ser alterados aqui.'
  if (role === 'Diretor') return 'O curso segue o escopo do seu perfil e não pode ser alterado aqui.'
  return null
}

export function StudentEditor({ student, userRole, onClose, onSave, onLoadTurmaSubjects, contextMessage }: StudentEditorProps) {
  const scopeMessage = scopeMessageFor(userRole)
  const titleId = useId()
  const dialogRef = useAccessibleDialog(true, onClose)

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby={titleId} aria-modal="true" className="modal-card" ref={dialogRef} role="dialog" tabIndex={-1}>
        <div className="modal-header">
          <div>
            <h2 id={titleId}>Editar aluno</h2>
            <p className="muted">{student.nome} · {student.matricula}</p>
            {contextMessage && <p className="muted student-editor-context">{contextMessage}</p>}
            {scopeMessage && <p className="muted student-editor-context">{scopeMessage}</p>}
          </div>
          <button aria-label="Fechar editor" className="icon-button" onClick={onClose} type="button">×</button>
        </div>
        <StudentForm
          initialStudent={student}
          key={student.matricula}
          mode="edit"
          onCancel={onClose}
          onLoadTurmaSubjects={onLoadTurmaSubjects}
          onSubmit={onSave}
          lockedScopeFields={lockedScopeFieldsFor(userRole)}
          submitLabel="Salvar alterações"
        />
      </section>
    </div>
  )
}

/** Responsabilidade: exibe o formulário modal para editar um aluno existente. */

import type { Student, StudentPayload } from '../types'
import { StudentForm } from './StudentForm'

interface StudentEditorProps {
  student: Student
  onClose: () => void
  onSave: (payload: StudentPayload) => Promise<string | void>
  onLoadTurmaSubjects: (turma: string) => Promise<string[]>
}

export function StudentEditor({ student, onClose, onSave, onLoadTurmaSubjects }: StudentEditorProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-label={`Editar ${student.nome}`} aria-modal="true" className="modal-card" role="dialog">
        <div className="modal-header">
          <div>
            <h2>Editar aluno</h2>
            <p className="muted">{student.nome} · {student.matricula}</p>
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
          submitLabel="Salvar alterações"
        />
      </section>
    </div>
  )
}

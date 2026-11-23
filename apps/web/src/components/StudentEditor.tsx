/** Responsabilidade: exibe o formulário modal para editar um aluno existente. */

import { useId, useState } from 'react'
import type { InitialStudentCredentials, Student, StudentPayload } from '../types'
import { useAccessibleDialog } from '../utils/useAccessibleDialog'
import { StudentForm } from './StudentForm'

interface StudentEditorProps {
  student: Student
  userRole: string
  onClose: () => void
  onSave: (payload: StudentPayload) => Promise<string | void>
  onLoadTurmaSubjects: (turma: string) => Promise<string[]>
  onResetCredentials?: () => Promise<InitialStudentCredentials>
  contextMessage?: string
}

function lockedScopeFieldsFor(role: string): Array<'curso' | 'disciplina' | 'turma'> {
  if (role === 'Professor') return ['curso', 'disciplina', 'turma']
  if (role === 'Diretor' || role === 'Coordenador') return ['curso']
  return []
}

function scopeMessageFor(role: string): string | null {
  if (role === 'Professor') return 'Curso, disciplina e turma seguem o escopo do seu perfil e não podem ser alterados aqui.'
  if (role === 'Diretor' || role === 'Coordenador') return 'O curso segue o escopo do seu perfil e não pode ser alterado aqui.'
  return null
}

export function StudentEditor({ student, userRole, onClose, onSave, onLoadTurmaSubjects, onResetCredentials, contextMessage }: StudentEditorProps) {
  const scopeMessage = scopeMessageFor(userRole)
  const titleId = useId()
  const dialogRef = useAccessibleDialog(true, onClose)
  const [credentials, setCredentials] = useState<InitialStudentCredentials | null>(null)
  const [resettingCredentials, setResettingCredentials] = useState(false)
  const [credentialError, setCredentialError] = useState('')

  async function resetCredentials() {
    if (!onResetCredentials) return
    const confirmed = window.confirm(
      `Redefinir a senha de ${student.nome}? A sessão atual do aluno será encerrada e uma nova senha temporária será emitida.`,
    )
    if (!confirmed) return

    setCredentialError('')
    setResettingCredentials(true)
    try {
      setCredentials(await onResetCredentials())
    } catch (requestError) {
      setCredentialError(requestError instanceof Error ? requestError.message : 'Não foi possível redefinir as credenciais.')
    } finally {
      setResettingCredentials(false)
    }
  }

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
        {onResetCredentials && (
          <div className="student-editor-credentials">
            <button className="button button-secondary" disabled={resettingCredentials} onClick={() => void resetCredentials()} type="button">
              {resettingCredentials ? 'Redefinindo…' : 'Redefinir senha temporária'}
            </button>
            <p className="muted">Use somente quando o aluno não possuir mais a senha. A senha anterior deixa de funcionar imediatamente.</p>
          </div>
        )}
        {credentialError && <div className="alert alert-error" role="alert">{credentialError}</div>}
        {credentials && (
          <section aria-live="assertive" className="alert alert-warning initial-credentials-card" role="alert">
            <div>
              <h3>Nova credencial temporária</h3>
              <p>Anote e entregue por um canal seguro. Esta senha será exibida somente agora e deverá ser trocada no primeiro acesso.</p>
              <dl className="initial-credentials-values">
                <div><dt>Usuário</dt><dd><code>{credentials.usuario}</code></dd></div>
                <div><dt>Senha temporária</dt><dd><code>{credentials.senhaTemporaria}</code></dd></div>
              </dl>
            </div>
            <button className="button button-secondary" onClick={() => setCredentials(null)} type="button">Já anotei</button>
          </section>
        )}
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

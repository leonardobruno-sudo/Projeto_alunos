/** Papel de `InitialPasswordPage`: apresenta e coleta dados em um componente reutilizável, recebendo estado e ações da página que o utiliza.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

/** Exige a troca da senha temporária de uma conta recém-criada. */

import { useState, type FormEvent } from 'react'
import { PasswordInput } from './PasswordInput'
import type { User } from '../types'

interface PasswordPayload {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

interface InitialPasswordPageProps {
  user: User
  saving: boolean
  errorMessage?: string | null
  onSubmit: (payload: PasswordPayload) => Promise<void>
  onLogout: () => void
}

export function InitialPasswordPage({ errorMessage, onLogout, onSubmit, saving, user }: InitialPasswordPageProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validationError, setValidationError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidationError('')

    if (newPassword !== confirmPassword) {
      setValidationError('A confirmação da nova senha não confere.')
      return
    }

    await onSubmit({ currentPassword, newPassword, confirmPassword })
  }

  const displayName = user.nome?.trim() || user.username
  const visibleError = validationError || errorMessage

  return (
    <main className="login-page" aria-labelledby="initial-password-title">
      <section className="login-card initial-password-card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="login-brand-name">
            Sistema de Gerenciamento de Alunos Cotistas <span className="brand-acronym">(SGAC)</span>
          </span>
        </div>
        <p className="eyebrow">Primeiro acesso</p>
        <h1 id="initial-password-title">Crie sua senha pessoal</h1>
        <p className="muted">
          Olá, {displayName}. Para proteger sua conta, substitua agora a senha temporária fornecida pela instituição.
        </p>

        {visibleError && <div className="alert alert-error" role="alert">{visibleError}</div>}

        <form className="stack-form" onSubmit={(event) => void submit(event)}>
          <PasswordInput
            autoComplete="current-password"
            label="Senha temporária"
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            value={currentPassword}
          />
          <PasswordInput
            autoComplete="new-password"
            label="Nova senha"
            minLength={8}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            value={newPassword}
          />
          <PasswordInput
            autoComplete="new-password"
            label="Confirmar nova senha"
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            value={confirmPassword}
          />
          <button className="button button-primary button-block" disabled={saving} type="submit">
            {saving ? 'Salvando nova senha…' : 'Salvar e continuar'}
          </button>
          <button className="text-button" disabled={saving} onClick={onLogout} type="button">
            Sair da conta
          </button>
        </form>
      </section>
    </main>
  )
}

/** Responsabilidade: reúne preferências visuais, troca de senha e backup administrativo. */

import { useState, type FormEvent } from 'react'
import type { User } from '../types'
import { api } from '../utils/api'

interface SettingsPageProps {
  user: User
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onMessage: (message: string) => void
  onError: (error: unknown) => string
}

export function SettingsPage({ user, theme, onToggleTheme, onMessage, onError }: SettingsPageProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [backupError, setBackupError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError('')

    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação da nova senha não confere.')
      return
    }

    setSavingPassword(true)
    try {
      const result = await api.changePassword({ currentPassword, newPassword, confirmPassword })
      onMessage(result.message || 'Senha alterada com sucesso.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (requestError) {
      setPasswordError(onError(requestError))
    } finally {
      setSavingPassword(false)
    }
  }

  async function createBackup() {
    setBackupError('')
    setCreatingBackup(true)
    try {
      const result = await api.createBackup()
      onMessage(result.message || 'Backup gerado com sucesso.')
    } catch (requestError) {
      setBackupError(onError(requestError))
    } finally {
      setCreatingBackup(false)
    }
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Preferências e segurança</p>
          <h1>Configurações</h1>
          <p className="muted">Personalize a interface e proteja sua conta.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Tema</h2>
              <p className="muted">O modo atual é {theme === 'dark' ? 'escuro' : 'claro'}.</p>
            </div>
          </div>
          <button className="button button-secondary" onClick={onToggleTheme} type="button">
            {theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          </button>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Alterar senha</h2>
              <p className="muted">Use uma senha nova e difícil de adivinhar.</p>
            </div>
          </div>
          {passwordError && <div className="alert alert-error" role="alert">{passwordError}</div>}
          <form className="stack-form" onSubmit={changePassword}>
            <label>
              Senha atual
              <input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} />
            </label>
            <label>
              Nova senha
              <input autoComplete="new-password" minLength={8} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} />
            </label>
            <label>
              Confirmar nova senha
              <input autoComplete="new-password" minLength={8} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
            </label>
            <button className="button button-primary" disabled={savingPassword} type="submit">
              {savingPassword ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        </section>

        {user.role === 'Admin' && (
          <section className="card admin-setting">
            <div className="section-heading">
              <div>
                <h2>Backup do banco</h2>
                <p className="muted">Gere uma cópia de segurança manual dos dados.</p>
              </div>
            </div>
            {backupError && <div className="alert alert-error" role="alert">{backupError}</div>}
            <button className="button button-primary" disabled={creatingBackup} onClick={() => void createBackup()} type="button">
              {creatingBackup ? 'Gerando backup...' : 'Gerar backup'}
            </button>
          </section>
        )}
      </div>
    </section>
  )
}

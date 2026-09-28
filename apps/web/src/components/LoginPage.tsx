/** Responsabilidade: coleta credenciais e inicia a sessão do usuário. */

import { useState, type FormEvent } from 'react'
import { api, getErrorMessage } from '../utils/api'
import type { User } from '../types'

interface LoginPageProps {
  onLogin: (user: User, message: string) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const result = await api.login(username.trim(), password)
      onLogin(result.data, result.message || 'Login realizado com sucesso.')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="login-brand-name">
            Sistema de Gerenciamento de Alunos Cotistas <span className="brand-acronym">(SGAC)</span>
          </span>
        </div>
        <h1 id="login-title">Login</h1>
        <p className="muted">Acesse com seu usuário, matrícula ou nome completo.</p>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <form className="stack-form" onSubmit={handleSubmit}>
          <label>
            Usuário, matrícula ou nome
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Ex.: 2024001 ou Ana Silva"
              required
              value={username}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="button button-primary button-block" disabled={submitting} type="submit">
            {submitting ? 'Fazendo login...' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  )
}

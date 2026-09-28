/** Responsabilidade: administra contas, perfis e escopos de acesso dos usuários. */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { User, UserCreatePayload, UserUpdatePayload } from '../types'
import { api } from '../utils/api'

interface PermissionsPageProps {
  onMessage: (message: string) => void
  onError: (error: unknown) => string
}

interface PermissionRowProps {
  user: User
  onSave: (id: number, payload: UserUpdatePayload) => Promise<string>
  onDelete: (user: User) => Promise<string>
}

const roles = ['Admin', 'Diretor', 'Professor']

const emptyUserForm: UserCreatePayload = {
  username: '',
  password: '',
  nome: '',
  role: 'Professor',
  curso: '',
  disciplina: '',
  turma: '',
}

function usersFrom(data: User[] | { users: User[] }): User[] {
  return Array.isArray(data) ? data : data.users ?? []
}

function PermissionRow({ user, onSave, onDelete }: PermissionRowProps) {
  const [role, setRole] = useState(user.role)
  const [curso, setCurso] = useState(user.curso ?? '')
  const [disciplina, setDisciplina] = useState(user.disciplina ?? '')
  const [turma, setTurma] = useState(user.turma ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)

    try {
      await onSave(user.id, { role, curso, disciplina, turma })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar o usuário.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    const displayName = user.nome || user.username
    const confirmed = window.confirm(
      `Excluir a conta de ${user.role} ${displayName}? O acesso será revogado imediatamente e esta ação não poderá ser desfeita.`,
    )
    if (!confirmed) return

    setError('')
    setDeleting(true)
    try {
      await onDelete(user)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível excluir o usuário.')
    } finally {
      setDeleting(false)
    }
  }

  if (user.role === 'Aluno') {
    return (
      <tr>
        <td>
          <strong>{user.nome || user.username}</strong>
          <span className="table-subtitle">{user.username}</span>
        </td>
        <td colSpan={4}>
          <p className="muted">
            Conta automática vinculada ao cadastro do aluno{user.matricula ? <> de matrícula <strong>{user.matricula}</strong></> : ''}.{' '}
            Altere os dados acadêmicos em Cadastro; esta conta não pode ter o perfil ou a matrícula mudados nesta tela.
          </p>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td>
        <strong>{user.nome || user.username}</strong>
        <span className="table-subtitle">{user.username}</span>
      </td>
      <td colSpan={4}>
        <form className="permissions-form" onSubmit={save}>
          <select aria-label={`Perfil de ${user.username}`} onChange={(event) => setRole(event.target.value)} value={role}>
            {roles.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input aria-label={`Curso de ${user.username}`} onChange={(event) => setCurso(event.target.value)} placeholder="Curso" value={curso} />
          <input aria-label={`Disciplina de ${user.username}`} onChange={(event) => setDisciplina(event.target.value)} placeholder="Disciplina" value={disciplina} />
          <input aria-label={`Turma de ${user.username}`} onChange={(event) => setTurma(event.target.value)} placeholder="Turma" value={turma} />
          <button className="button button-primary" disabled={saving || deleting} type="submit">{saving ? 'Salvando...' : 'Salvar'}</button>
          {(user.role === 'Professor' || user.role === 'Diretor') && (
            <button className="button button-danger" disabled={saving || deleting} onClick={() => void remove()} type="button">
              {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          {error && <span className="row-error">{error}</span>}
        </form>
      </td>
    </tr>
  )
}

export function PermissionsPage({ onMessage, onError }: PermissionsPageProps) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newUser, setNewUser] = useState<UserCreatePayload>(emptyUserForm)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.getUsers()
      setUsers(usersFrom(result.data))
    } catch (requestError) {
      setError(onError(requestError))
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  async function saveUser(id: number, payload: UserUpdatePayload): Promise<string> {
    try {
      const result = await api.updateUser(id, payload)
      const message = result.message || 'Permissões atualizadas com sucesso.'
      onMessage(message)
      setUsers((current) => current.map((user) => (user.id === id ? result.data : user)))
      return message
    } catch (requestError) {
      throw new Error(onError(requestError))
    }
  }

  async function deleteUser(user: User): Promise<string> {
    try {
      const result = await api.deleteUser(user.id)
      const message = result.message || 'Usuário excluído com sucesso.'
      setUsers((current) => current.filter((item) => item.id !== user.id))
      onMessage(message)
      return message
    } catch (requestError) {
      throw new Error(onError(requestError))
    }
  }

  function updateNewUser(field: keyof UserCreatePayload, value: string) {
    setNewUser((current) => ({ ...current, [field]: value }))
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError('')

    if (newUser.password.length < 8) {
      setCreateError('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    setCreating(true)
    try {
      const result = await api.createUser({
        ...newUser,
        username: newUser.username.trim(),
        nome: newUser.nome?.trim(),
        curso: newUser.curso?.trim(),
        disciplina: newUser.disciplina?.trim(),
        turma: newUser.turma?.trim(),
      })
      setUsers((current) => [result.data, ...current])
      setNewUser(emptyUserForm)
      onMessage(result.message || 'Usuário criado com sucesso.')
    } catch (requestError) {
      setCreateError(onError(requestError))
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Administração</p>
          <h1>Permissões</h1>
          <p className="muted">Defina os perfis e os limites de acesso de cada usuário.</p>
        </div>
        <button className="button button-secondary" onClick={() => void load()} type="button">Atualizar usuários</button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="card">
        <div className="section-heading compact">
          <div>
            <h2>Novo usuário</h2>
            <p className="muted">
              Cadastre alunos somente na tela Cadastro ou pela importação CSV. Aqui são criadas e ajustadas apenas contas de equipe.
            </p>
          </div>
        </div>

        <form className="form-grid student-form" onSubmit={createUser}>
          <label>
            Usuário
            <input
              autoComplete="username"
              onChange={(event) => updateNewUser('username', event.target.value)}
              pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,59}"
              required
              title="Use 3 a 60 letras, números, pontos, hífens ou sublinhados."
              value={newUser.username}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => updateNewUser('password', event.target.value)}
              required
              type="password"
              value={newUser.password}
            />
          </label>
          <label>
            Nome
            <input
              onChange={(event) => updateNewUser('nome', event.target.value)}
              required
              value={newUser.nome}
            />
          </label>
          <label>
            Perfil
            <select onChange={(event) => updateNewUser('role', event.target.value)} value={newUser.role}>
              {roles.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label>
            Curso
            <input
              onChange={(event) => updateNewUser('curso', event.target.value)}
              required={['Diretor', 'Professor'].includes(newUser.role)}
              value={newUser.curso}
            />
          </label>
          <label>
            Disciplina
            <input
              onChange={(event) => updateNewUser('disciplina', event.target.value)}
              required={newUser.role === 'Professor'}
              value={newUser.disciplina}
            />
          </label>
          <label>
            Turma
            <input
              onChange={(event) => updateNewUser('turma', event.target.value)}
              required={newUser.role === 'Professor'}
              value={newUser.turma}
            />
          </label>
          {createError && <div className="alert alert-error field-wide" role="alert">{createError}</div>}
          <div className="form-actions field-wide">
            <button className="button button-primary" disabled={creating} type="submit">
              {creating ? 'Criando...' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        {loading ? (
          <div className="loading-state">Carregando usuários...</div>
        ) : users.length === 0 ? (
          <div className="empty-state">Nenhum usuário encontrado.</div>
        ) : (
          <div className="table-wrap">
            <table className="permissions-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Perfil, curso, disciplina e turma</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => <PermissionRow key={user.id} onDelete={deleteUser} onSave={saveUser} user={user} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

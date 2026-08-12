/** Responsabilidade: fornece o layout autenticado, navegação lateral e ações da sessão. */

import type { ReactNode } from 'react'
import { canManageStudents, type PageKey, type User } from '../types'

interface AppShellProps {
  user: User
  page: PageKey
  theme: 'light' | 'dark'
  loggingOut: boolean
  onNavigate: (page: PageKey) => void
  onToggleTheme: () => void
  onLogout: () => void
  children: ReactNode
}

const navigationItems: Array<{ page: PageKey; label: string; adminOnly?: boolean; managerOnly?: boolean }> = [
  { page: 'dashboard', label: 'Dashboard' },
  { page: 'estatisticas', label: 'Estatísticas' },
  { page: 'cadastro', label: 'Cadastro', managerOnly: true },
  { page: 'materias', label: 'Matérias' },
  { page: 'periodos', label: 'Períodos' },
  { page: 'configuracoes', label: 'Configurações' },
  { page: 'permissoes', label: 'Permissões', adminOnly: true },
]

export function AppShell({
  user,
  page,
  theme,
  loggingOut,
  onNavigate,
  onToggleTheme,
  onLogout,
  children,
}: AppShellProps) {
  const name = user.nome || user.username

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>
              Sistema de Alunos Cotistas <span className="brand-acronym">(SAC)</span>
            </strong>
            <span>Painel de {user.role}</span>
          </div>
        </div>

        <nav className="main-nav" aria-label="Navegação principal">
          {navigationItems
            .filter((item) => !item.adminOnly || user.role === 'Admin')
            .filter((item) => !item.managerOnly || canManageStudents(user))
            .map((item) => (
              <button
                className={page === item.page ? 'nav-item active' : 'nav-item'}
                key={item.page}
                onClick={() => onNavigate(item.page)}
                type="button"
              >
                {item.label}
              </button>
            ))}
        </nav>

        <div className="sidebar-footer">
          <div className="profile-card">
            <strong>{name}</strong>
            <span>{user.role}</span>
          </div>
          <button className="button button-secondary sidebar-action" onClick={onToggleTheme} type="button">
            {theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          </button>
          <button className="button button-danger sidebar-action" disabled={loggingOut} onClick={onLogout} type="button">
            {loggingOut ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </aside>

      <main className="content-area">{children}</main>
    </div>
  )
}

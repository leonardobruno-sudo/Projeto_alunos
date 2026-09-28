/** Responsabilidade: coordena sessão, navegação, tema e avisos globais do aplicativo. */

import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { LoginPage } from './components/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { PermissionsPage } from './pages/PermissionsPage'
import { PeriodsPage } from './pages/PeriodsPage'
import { RegistrationPage } from './pages/RegistrationPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatisticsPage } from './pages/StatisticsPage'
import { SubjectsPage } from './pages/SubjectsPage'
import { canManageStudents, type PageKey, type User } from './types'
import { api, getErrorMessage, isUnauthorized } from './utils/api'

type Notice = {
  message: string
  type: 'success' | 'error'
}

const pages: PageKey[] = ['dashboard', 'estatisticas', 'cadastro', 'materias', 'periodos', 'configuracoes', 'permissoes']

function pageFromHash(): PageKey {
  const hash = window.location.hash.replace('#', '')
  return pages.includes(hash as PageKey) ? (hash as PageKey) : 'dashboard'
}

function initialTheme(): 'light' | 'dark' {
  return window.localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [page, setPage] = useState<PageKey>(pageFromHash)
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)
  const [loadingSession, setLoadingSession] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    function syncPageFromHash() {
      setPage(pageFromHash())
    }

    window.addEventListener('hashchange', syncPageFromHash)
    return () => window.removeEventListener('hashchange', syncPageFromHash)
  }, [])

  useEffect(() => {
    let active = true

    async function loadSession() {
      try {
        const result = await api.getCurrentUser()
        if (active) setUser(result.data)
      } catch (requestError) {
        if (active && !isUnauthorized(requestError)) {
          setNotice({ message: getErrorMessage(requestError), type: 'error' })
        }
      } finally {
        if (active) setLoadingSession(false)
      }
    }

    void loadSession()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const showMessage = useCallback((message: string) => {
    setNotice({ message, type: 'success' })
  }, [])

  const handleError = useCallback((error: unknown): string => {
    const message = getErrorMessage(error)
    if (isUnauthorized(error)) {
      setUser(null)
      setNotice({ message: 'Sua sessão expirou. Entre novamente para continuar.', type: 'error' })
    }
    return message
  }, [])

  function navigate(nextPage: PageKey) {
    if (!user) return
    if (nextPage === 'permissoes' && user.role !== 'Admin') return
    if (nextPage === 'cadastro' && !canManageStudents(user)) return

    setPage(nextPage)
    window.location.hash = nextPage
  }

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  async function logout() {
    setLoggingOut(true)
    try {
      const result = await api.logout()
      showMessage(result.message || 'Sessão encerrada.')
    } catch (requestError) {
      setNotice({ message: getErrorMessage(requestError), type: 'error' })
    } finally {
      setUser(null)
      setLoggingOut(false)
      window.location.hash = 'dashboard'
    }
  }

  function completeLogin(nextUser: User, message: string) {
    setUser(nextUser)
    setPage('dashboard')
    window.location.hash = 'dashboard'
    showMessage(message)
  }

  if (loadingSession) {
    return <main className="startup-state">Carregando sistema...</main>
  }

  if (!user) {
    return (
      <>
        {notice && <div className={`toast ${notice.type}`}>{notice.message}</div>}
        <LoginPage onLogin={completeLogin} />
      </>
    )
  }

  let content = <DashboardPage onError={handleError} onMessage={showMessage} user={user} />

  if (page === 'estatisticas') {
    content = <StatisticsPage onError={handleError} onMessage={showMessage} user={user} />
  } else if (page === 'cadastro' && canManageStudents(user)) {
    content = <RegistrationPage onError={handleError} onMessage={showMessage} />
  } else if (page === 'materias') {
    content = <SubjectsPage onError={handleError} onMessage={showMessage} user={user} />
  } else if (page === 'periodos') {
    content = <PeriodsPage onError={handleError} onMessage={showMessage} user={user} />
  } else if (page === 'configuracoes') {
    content = <SettingsPage onError={handleError} onMessage={showMessage} onToggleTheme={toggleTheme} theme={theme} user={user} />
  } else if (page === 'permissoes' && user.role === 'Admin') {
    content = <PermissionsPage onError={handleError} onMessage={showMessage} />
  }

  return (
    <>
      {notice && <div className={`toast ${notice.type}`}>{notice.message}</div>}
      <AppShell
        loggingOut={loggingOut}
        onLogout={() => void logout()}
        onNavigate={navigate}
        onToggleTheme={toggleTheme}
        page={page}
        theme={theme}
        user={user}
      >
        {content}
      </AppShell>
    </>
  )
}

export default App

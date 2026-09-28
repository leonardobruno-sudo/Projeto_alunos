/** Responsabilidade: coordena sessão, navegação, tema e avisos globais do aplicativo. */

import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { LoginPage } from './components/LoginPage'
import { ChatDrawer } from './features/chat'
import { DashboardPage } from './pages/DashboardPage'
import { PermissionsPage } from './pages/PermissionsPage'
import { PeriodsPage } from './pages/PeriodsPage'
import { RegistrationPage } from './pages/RegistrationPage'
import { SettingsPage } from './pages/SettingsPage'
import type { AccessibilityPreferences } from './pages/SettingsPage'
import { StatisticsPage } from './pages/StatisticsPage'
import { SubjectsPage } from './pages/SubjectsPage'
import { canRegisterStudents, type PageKey, type User } from './types'
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

function initialAccessibilityPreferences(): AccessibilityPreferences {
  const stored = window.localStorage.getItem('accessibility')
  if (stored) {
    try {
      const preferences = JSON.parse(stored) as Partial<AccessibilityPreferences>
      return {
        highContrast: preferences.highContrast === true,
        largeText: preferences.largeText === true,
        reduceMotion: preferences.reduceMotion === true,
      }
    } catch {
      window.localStorage.removeItem('accessibility')
    }
  }

  return {
    highContrast: false,
    largeText: false,
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [page, setPage] = useState<PageKey>(pageFromHash)
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>(initialAccessibilityPreferences)
  const [loadingSession, setLoadingSession] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.contrast = accessibility.highContrast ? 'high' : 'normal'
    document.documentElement.dataset.textSize = accessibility.largeText ? 'large' : 'normal'
    document.documentElement.dataset.motion = accessibility.reduceMotion ? 'reduced' : 'full'
    window.localStorage.setItem('accessibility', JSON.stringify(accessibility))
  }, [accessibility])

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
    if (nextPage === 'cadastro' && !canRegisterStudents(user)) return

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
      setChatOpen(false)
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
    return <main aria-busy="true" aria-live="polite" className="startup-state" role="status">Carregando sistema...</main>
  }

  if (!user) {
    return (
      <>
        {notice && (
          <div aria-atomic="true" aria-live={notice.type === 'error' ? 'assertive' : 'polite'} className={`toast ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
            {notice.message}
          </div>
        )}
        <LoginPage onLogin={completeLogin} />
      </>
    )
  }

  let content = <DashboardPage onError={handleError} onMessage={showMessage} user={user} />

  if (page === 'estatisticas') {
    content = <StatisticsPage onError={handleError} onMessage={showMessage} user={user} />
  } else if (page === 'cadastro' && canRegisterStudents(user)) {
    content = <RegistrationPage onError={handleError} onMessage={showMessage} user={user} />
  } else if (page === 'materias') {
    content = <SubjectsPage onError={handleError} onMessage={showMessage} user={user} />
  } else if (page === 'periodos') {
    content = <PeriodsPage onError={handleError} onMessage={showMessage} user={user} />
  } else if (page === 'configuracoes') {
    content = (
      <SettingsPage
        accessibility={accessibility}
        onError={handleError}
        onMessage={showMessage}
        onAccessibilityChange={(key, value) => setAccessibility((current) => ({ ...current, [key]: value }))}
        onToggleTheme={toggleTheme}
        onUserChange={(nextUser) => {
          setUser((currentUser) => currentUser
            ? { ...currentUser, ...nextUser, capabilities: nextUser.capabilities ?? currentUser.capabilities }
            : nextUser)
        }}
        theme={theme}
        user={user}
      />
    )
  } else if (page === 'permissoes' && user.role === 'Admin') {
    content = <PermissionsPage onError={handleError} onMessage={showMessage} />
  }

  return (
    <>
      {notice && (
        <div aria-atomic="true" aria-live={notice.type === 'error' ? 'assertive' : 'polite'} className={`toast ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}
      <AppShell
        loggingOut={loggingOut}
        onOpenChat={() => setChatOpen(true)}
        onLogout={() => void logout()}
        onNavigate={navigate}
        onToggleTheme={toggleTheme}
        page={page}
        theme={theme}
        user={user}
      >
        {content}
      </AppShell>
      <ChatDrawer
        onClose={() => setChatOpen(false)}
        onSend={async (message) => (await api.chat(message)).data}
        open={chatOpen}
        user={user}
      />
    </>
  )
}

export default App

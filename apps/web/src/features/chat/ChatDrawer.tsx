import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import styles from './ChatDrawer.module.css'

/**
 * Deliberately small user contract so the chat feature can stay independent
 * from the application's session and API modules.
 */
export interface ChatUser {
  id: number | string
  username: string
  role: string
  nome?: string | null
  matricula?: string | null
  curso?: string | null
  turma?: string | null
}

export interface ChatSendResponse {
  message: string
  sources?: string[]
  mode?: string
}

export interface ChatDrawerProps {
  open: boolean
  onClose: () => void
  user: ChatUser
  onSend: (text: string) => Promise<ChatSendResponse>
  disabled?: boolean
}

type MessageAuthor = 'assistant' | 'user'
type MessageDeliveryState = 'sent' | 'pending' | 'error'

interface ChatMessage {
  id: string
  author: MessageAuthor
  content: string
  deliveryState: MessageDeliveryState
  sources?: string[]
  mode?: string
}

function suggestionsForRole(role: string): string[] {
  if (role === 'Aluno') {
    return ['Meus dados', 'Meu desempenho', 'Ativar acessibilidade', 'Ajuda']
  }

  if (['Admin', 'Diretor', 'Professor'].includes(role)) {
    return ['Resumo', 'Alunos em risco', 'Ativar acessibilidade', 'Ajuda']
  }

  return ['Ativar acessibilidade', 'Ajuda']
}

let messageSequence = 0

function nextMessageId(prefix: string): string {
  messageSequence += 1
  return `${prefix}-${Date.now()}-${messageSequence}`
}

function userDisplayName(user: ChatUser): string {
  return user.nome?.trim() || user.username
}

function createWelcomeMessage(user: ChatUser): ChatMessage {
  return {
    id: nextMessageId('assistant'),
    author: 'assistant',
    deliveryState: 'sent',
    content: `Olá, ${userDisplayName(user)}. Sou a assistente do SGAC. Pergunte com suas palavras sobre acessibilidade, uso do sistema ou informações acadêmicas autorizadas para o seu perfil.`,
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return 'Não foi possível obter uma resposta agora. Tente novamente em alguns instantes.'
}

function normalizeSources(sources?: string[]): string[] | undefined {
  const normalized = Array.from(new Set((sources ?? []).map((source) => source.trim()).filter(Boolean)))
  return normalized.length ? normalized : undefined
}

function formatScope(user: ChatUser): string {
  const details = [user.role && `perfil ${user.role}`, user.curso && `curso ${user.curso}`, user.turma && `turma ${user.turma}`].filter(
    Boolean,
  )

  return details.length ? details.join(' · ') : 'perfil autenticado'
}

function formatMode(mode?: string): string | undefined {
  if (mode === 'local-model') return 'Resposta redigida localmente'
  if (mode === 'contextual') return 'Resposta baseada no contexto local'
  return mode
}

export function ChatDrawer({ open, onClose, user, onSend, disabled = false }: ChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createWelcomeMessage(user)])
  const [draft, setDraft] = useState('')
  const [scopeConfirmed, setScopeConfirmed] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const confirmationRef = useRef<HTMLButtonElement>(null)
  const lastFocusedElementRef = useRef<HTMLElement | null>(null)
  const endOfMessagesRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const currentScopeKeyRef = useRef('')
  const previousScopeKeyRef = useRef('')
  const scopeConfirmedRef = useRef(scopeConfirmed)
  const titleId = useId()
  const descriptionId = useId()
  const inputHintId = useId()
  const errorId = useId()

  const scopeKey = `${user.id}|${user.username}|${user.role}|${user.matricula ?? ''}|${user.curso ?? ''}|${user.turma ?? ''}`
  const scopeDescription = useMemo(() => formatScope(user), [user])
  const suggestions = useMemo(() => suggestionsForRole(user.role), [user.role])
  const name = userDisplayName(user)
  const inputIsDisabled = disabled || isSending || !scopeConfirmed

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    scopeConfirmedRef.current = scopeConfirmed
  }, [scopeConfirmed])

  useEffect(() => {
    currentScopeKeyRef.current = scopeKey
  }, [scopeKey])

  useEffect(() => {
    if (!previousScopeKeyRef.current) {
      previousScopeKeyRef.current = scopeKey
      return
    }

    if (previousScopeKeyRef.current === scopeKey) return

    previousScopeKeyRef.current = scopeKey
    setMessages([createWelcomeMessage(user)])
    setDraft('')
    setScopeConfirmed(false)
    setIsSending(false)
    setError(null)

    if (!open) return
    const frame = window.requestAnimationFrame(() => confirmationRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open, scopeKey, user])

  useEffect(() => {
    if (!open) return undefined

    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => {
      if (scopeConfirmedRef.current) {
        inputRef.current?.focus()
      } else {
        confirmationRef.current?.focus()
      }
    })

    function keepFocusInDialog(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0)

      if (!focusableElements.length) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInDialog)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', keepFocusInDialog)
      lastFocusedElementRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const reduceMotion = document.documentElement.dataset.motion === 'reduced'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    endOfMessagesRef.current?.scrollIntoView({ block: 'end', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [messages, open])

  const sendMessage = useCallback(async () => {
    const text = draft.trim()
    if (!text || inputIsDisabled) return

    const requestScopeKey = scopeKey
    const messageId = nextMessageId('user')
    setDraft('')
    setError(null)
    setIsSending(true)
    setMessages((current) => [
      ...current,
      { id: messageId, author: 'user', content: text, deliveryState: 'pending' },
    ])

    try {
      const response = await onSend(text)
      if (currentScopeKeyRef.current !== requestScopeKey) return

      setMessages((current): ChatMessage[] => [
        ...current.map((message): ChatMessage => (message.id === messageId ? { ...message, deliveryState: 'sent' } : message)),
        {
          id: nextMessageId('assistant'),
          author: 'assistant',
          content: response.message.trim() || 'Não encontrei uma resposta para essa pergunta.',
          deliveryState: 'sent',
          sources: normalizeSources(response.sources),
          mode: response.mode?.trim() || undefined,
        },
      ])
    } catch (requestError) {
      if (currentScopeKeyRef.current !== requestScopeKey) return

      const message = getErrorMessage(requestError)
      setError(message)
      setMessages((current): ChatMessage[] => [
        ...current.map((item): ChatMessage => (item.id === messageId ? { ...item, deliveryState: 'error' } : item)),
        {
          id: nextMessageId('assistant'),
          author: 'assistant',
          content: 'Não consegui concluir essa consulta. Verifique sua conexão e tente novamente.',
          deliveryState: 'sent',
        },
      ])
    } finally {
      if (currentScopeKeyRef.current === requestScopeKey) setIsSending(false)
    }
  }, [draft, inputIsDisabled, onSend, scopeKey])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage()
  }

  function handleTextareaKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void sendMessage()
  }

  function handleConfirmScope() {
    setScopeConfirmed(true)
    setError(null)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  if (!open) return null

  return (
    <div className={styles.backdrop} onMouseDown={handleBackdropMouseDown}>
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.drawer}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Assistente SGAC</p>
            <h2 id={titleId}>Ajuda com seu contexto acadêmico</h2>
            <p id={descriptionId}>Pergunte sobre dados e orientações liberados para sua conta.</p>
          </div>
          <button aria-label="Fechar assistente" className={styles.closeButton} onClick={onClose} type="button">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <section aria-label="Escopo da conversa" className={styles.scopeCard}>
          <div>
            <strong>Escopo da conta</strong>
            <p>
              {name} · {scopeDescription}
            </p>
          </div>
          {scopeConfirmed ? (
            <span className={styles.scopeConfirmed} role="status">
              Escopo confirmado
            </span>
          ) : (
            <button className={styles.confirmButton} onClick={handleConfirmScope} ref={confirmationRef} type="button">
              Entendi o escopo
            </button>
          )}
          <p className={styles.scopeNotice}>
            As consultas devem ser autorizadas pelo servidor com base na sua sessão; não informe senhas ou dados de outras pessoas.
          </p>
        </section>

        <div aria-atomic="false" aria-label="Histórico da conversa" aria-live="polite" className={styles.messages} role="log">
          {messages.map((message) => (
            <article
              className={`${styles.message} ${message.author === 'user' ? styles.userMessage : styles.assistantMessage}`}
              key={message.id}
            >
              <div className={styles.messageMeta}>
                <strong>{message.author === 'user' ? 'Você' : 'Assistente SGAC'}</strong>
                {message.deliveryState === 'pending' && <span>Enviando…</span>}
                {message.deliveryState === 'error' && <span className={styles.deliveryError}>Não enviado</span>}
              </div>
              <p>{message.content}</p>
              {message.mode && <span className={styles.mode}>{formatMode(message.mode)}</span>}
              {message.sources && (
                <div className={styles.sources}>
                  <strong>Fontes consultadas</strong>
                  <ul>
                    {message.sources.map((source) => (
                      <li key={`${message.id}-${source}`}>{source}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
          {isSending && (
            <div aria-label="A assistente está preparando uma resposta" className={styles.typingIndicator} role="status">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span className={styles.srOnly}>A assistente está preparando uma resposta.</span>
            </div>
          )}
          <div ref={endOfMessagesRef} />
        </div>

        <section aria-label="Sugestões de perguntas" className={styles.suggestions}>
          <span>Você pode perguntar</span>
          <div>
            {suggestions.map((suggestion) => (
              <button
                disabled={disabled || isSending}
                key={suggestion}
                onClick={() => {
                  setDraft(suggestion)
                  window.requestAnimationFrame(() => inputRef.current?.focus())
                }}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </section>

        <form className={styles.composer} onSubmit={handleSubmit}>
          <label className={styles.srOnly} htmlFor={inputHintId}>
            Mensagem para a assistente
          </label>
          <textarea
            aria-describedby={error ? errorId : undefined}
            disabled={inputIsDisabled}
            id={inputHintId}
            maxLength={1000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={scopeConfirmed ? 'Escreva sua pergunta…' : 'Confirme o escopo para começar'}
            ref={inputRef}
            rows={3}
            value={draft}
          />
          <div className={styles.composerFooter}>
            <span>{draft.length}/1000 · Enter envia, Shift + Enter quebra a linha</span>
            <button className={styles.sendButton} disabled={!draft.trim() || inputIsDisabled} type="submit">
              {isSending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
          {error && (
            <p className={styles.error} id={errorId} role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

export default ChatDrawer

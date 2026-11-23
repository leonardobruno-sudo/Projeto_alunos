/** Papel de `AcademicLifePage`: agrupa uma funcionalidade do produto e integra sua apresentação com os tipos e serviços que a alimentam.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

/** Apresenta calendário, diários, frequência e avaliações fornecidos pela API acadêmica. */

import { useCallback, useMemo, useState } from 'react'
import type {
  AcademicAssessment,
  AcademicAttendance,
  AcademicCalendarEvent,
  AcademicClassSession,
  AcademicDocument,
  AcademicLifePageProps,
} from './academicTypes'
import './AcademicLifePage.css'

type AcademicSection = 'visao-geral' | 'calendario' | 'diario' | 'frequencia' | 'avaliacoes' | 'documentos'

interface SectionOption {
  id: AcademicSection
  label: string
}

const sectionOptions: SectionOption[] = [
  { id: 'visao-geral', label: 'Visão geral' },
  { id: 'calendario', label: 'Calendário' },
  { id: 'diario', label: 'Diário' },
  { id: 'frequencia', label: 'Frequência' },
  { id: 'avaliacoes', label: 'Avaliações' },
  { id: 'documentos', label: 'Documentos' },
]

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const percentageFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})

const gradeFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
})

function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(value?: string | null): string {
  const parsed = parseDate(value)
  return parsed ? dateFormatter.format(parsed) : 'Não informado'
}

function formatDateTime(value?: string | null): string {
  const parsed = parseDate(value)
  return parsed ? dateTimeFormatter.format(parsed) : 'Não informado'
}

function formatRange(startsAt?: string | null, endsAt?: string | null): string {
  const start = parseDate(startsAt)
  const end = parseDate(endsAt)
  if (!start) return 'Não informado'
  if (!end) return dateTimeFormatter.format(start)

  const sameDay = start.toDateString() === end.toDateString()
  const startText = dateTimeFormatter.format(start)
  const endText = sameDay
    ? end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : dateTimeFormatter.format(end)

  return `${startText} — ${endText}`
}

function formatMetric(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—'
}

function formatPercentage(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${percentageFormatter.format(value)}%` : '—'
}

function formatGrade(value?: number | null, maximum?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Ainda não divulgada'
  const grade = gradeFormatter.format(value)
  if (typeof maximum !== 'number' || !Number.isFinite(maximum)) return grade
  return `${grade} de ${gradeFormatter.format(maximum)}`
}

function sortByTimestamp<T extends { startsAt?: string | null; occursAt?: string | null; dueAt?: string | null }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftValue = parseDate(left.startsAt ?? left.occursAt ?? left.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const rightValue = parseDate(right.startsAt ?? right.occursAt ?? right.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
    return leftValue - rightValue
  })
}

function calendarKindLabel(kind: AcademicCalendarEvent['kind']): string {
  const labels: Record<AcademicCalendarEvent['kind'], string> = {
    letivo: 'Evento letivo',
    avaliacao: 'Avaliação',
    recesso: 'Recesso',
    prazo: 'Prazo',
    outro: 'Evento acadêmico',
  }
  return labels[kind]
}

function sessionStatusLabel(status: AcademicClassSession['status']): string {
  const labels: Record<AcademicClassSession['status'], string> = {
    prevista: 'Prevista',
    realizada: 'Realizada',
    cancelada: 'Cancelada',
  }
  return labels[status]
}

function attendanceStatusLabel(status: AcademicAttendance['status']): string {
  const labels: Record<NonNullable<AcademicAttendance['status']>, string> = {
    regular: 'Regular',
    alerta: 'Em alerta',
    risco: 'Em risco',
    indisponivel: 'Não calculada',
  }
  return status ? labels[status] : 'Não calculada'
}

function assessmentStatusLabel(status: AcademicAssessment['status']): string {
  const labels: Record<AcademicAssessment['status'], string> = {
    prevista: 'Prevista',
    disponivel: 'Disponível',
    corrigida: 'Corrigida',
    encerrada: 'Encerrada',
  }
  return labels[status]
}

function documentStatusLabel(status: AcademicDocument['status']): string {
  const labels: Record<AcademicDocument['status'], string> = {
    disponivel: 'Disponível',
    em_analise: 'Em análise',
    indisponivel: 'Indisponível',
  }
  return labels[status]
}

function EmptySection({ description, title }: { title: string; description: string }) {
  return (
    <div className="academic-empty-state" role="status">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

function StatusBadge({ className, label }: { className: string; label: string }) {
  return <span className={`academic-status ${className}`}>{label}</span>
}

function AcademicHeader({ data, viewer }: Pick<AcademicLifePageProps, 'data' | 'viewer'>) {
  const isStudent = viewer.role === 'Aluno'
  const name = viewer.name?.trim()
  const heading = isStudent ? 'Minha vida acadêmica' : 'Vida acadêmica'
  const description = isStudent
    ? 'Acompanhe informações registradas para o seu período letivo.'
    : 'Consulte os registros do período dentro do seu escopo de acesso.'

  return (
    <div className="page-header academic-page-header">
      <div>
        <p className="eyebrow">Ensino</p>
        <h1>{heading}</h1>
        <p className="muted">
          {description}{name ? ` Perfil: ${name}.` : ''}
        </p>
      </div>
      {data?.scopeLabel && <span className="academic-scope">{data.scopeLabel}</span>}
    </div>
  )
}

function CalendarPanel({ events, onOpenSubject }: {
  events: AcademicCalendarEvent[]
  onOpenSubject?: (subjectId: string) => void
}) {
  if (events.length === 0) {
    return <EmptySection description="Ainda não há eventos cadastrados para este período." title="Calendário sem eventos" />
  }

  return (
    <ol className="academic-timeline">
      {sortByTimestamp(events).map((event) => (
        <li className="academic-timeline-item" key={event.id}>
          <div className="academic-timeline-marker" aria-hidden="true" />
          <div className="academic-timeline-content">
            <div className="academic-item-meta">
              <StatusBadge className={`academic-status--${event.kind}`} label={calendarKindLabel(event.kind)} />
              <time dateTime={event.startsAt}>{event.allDay ? formatDate(event.startsAt) : formatRange(event.startsAt, event.endsAt)}</time>
            </div>
            <h3>{event.title}</h3>
            {event.description && <p>{event.description}</p>}
            {event.subjectId && event.subjectName && onOpenSubject && (
              <button className="academic-subject-link" onClick={() => onOpenSubject(event.subjectId!)} type="button">
                Ver {event.subjectName}
              </button>
            )}
            {event.subjectName && !onOpenSubject && <span className="academic-linked-subject">{event.subjectName}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function DiaryPanel({ onOpenSubject, sessions }: {
  sessions: AcademicClassSession[]
  onOpenSubject?: (subjectId: string) => void
}) {
  if (sessions.length === 0) {
    return <EmptySection description="Nenhuma aula foi enviada para o diário do período selecionado." title="Diário sem aulas lançadas" />
  }

  return (
    <div className="academic-diary-list">
      {sortByTimestamp(sessions).map((session) => (
        <article className="academic-diary-entry" key={session.id}>
          <div className="academic-diary-entry-header">
            <div>
              <span className="academic-subject-kicker">{session.subjectName}</span>
              <h3>{session.allDay ? formatDate(session.startsAt) : formatRange(session.startsAt, session.endsAt)}</h3>
            </div>
            <StatusBadge className={`academic-status--${session.status}`} label={sessionStatusLabel(session.status)} />
          </div>
          <dl className="academic-detail-list">
            {session.room && <div><dt>Local</dt><dd>{session.room}</dd></div>}
            {session.instructorName && <div><dt>Responsável</dt><dd>{session.instructorName}</dd></div>}
            {session.attendanceStatus && <div><dt>Frequência</dt><dd>{session.attendanceStatus.replace('_', ' ')}</dd></div>}
          </dl>
          {session.content && <p className="academic-session-content">{session.content}</p>}
          {onOpenSubject && (
            <button className="academic-subject-link" onClick={() => onOpenSubject(session.subjectId)} type="button">
              Abrir matéria
            </button>
          )}
        </article>
      ))}
    </div>
  )
}

function AttendancePanel({ attendance }: { attendance: AcademicAttendance[] }) {
  if (attendance.length === 0) {
    return <EmptySection description="A frequência por aula ainda não foi disponibilizada para este período." title="Frequência não disponível" />
  }

  const showsStudent = attendance.some((item) => Boolean(item.studentMatricula))

  return (
    <div aria-label="Tabela de frequência consolidada" className="table-wrap academic-table-wrap" tabIndex={0}>
      <table className="academic-table">
        <caption>Frequência consolidada conforme registrada pela fonte acadêmica.</caption>
        <thead>
          <tr>
            <th scope="col">Matéria</th>
            {showsStudent && <th scope="col">Matrícula</th>}
            <th scope="col">Aulas</th>
            <th scope="col">Lançadas</th>
            <th scope="col">Presenças</th>
            <th scope="col">Faltas</th>
            <th scope="col">Justificadas</th>
            <th scope="col">Faltas (%)</th>
            <th scope="col">Situação</th>
          </tr>
        </thead>
        <tbody>
          {attendance.map((item) => (
            <tr key={`${item.subjectId}:${item.studentMatricula ?? 'proprio'}`}>
              <th scope="row">{item.subjectName}</th>
              {showsStudent && <td>{item.studentMatricula || '—'}</td>}
              <td>{formatMetric(item.totalClasses)}</td>
              <td>{formatMetric(item.registeredClasses)}</td>
              <td>{formatMetric(item.attendedClasses)}</td>
              <td>{formatMetric(item.missedClasses)}</td>
              <td>{formatMetric(item.justifiedAbsences)}</td>
              <td>{formatPercentage(item.absencePercent)}</td>
              <td><StatusBadge className={`academic-status--${item.status ?? 'indisponivel'}`} label={attendanceStatusLabel(item.status)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AssessmentPanel({ assessments, onOpenSubject }: {
  assessments: AcademicAssessment[]
  onOpenSubject?: (subjectId: string) => void
}) {
  if (assessments.length === 0) {
    return <EmptySection description="Nenhuma avaliação foi disponibilizada para este período." title="Avaliações não encontradas" />
  }

  return (
    <div className="academic-assessment-grid">
      {sortByTimestamp(assessments).map((assessment) => {
        const eventDate = assessment.occursAt ?? assessment.dueAt
        return (
          <article className="academic-assessment-card" key={assessment.id}>
            <div className="academic-assessment-heading">
              <div>
                <span className="academic-subject-kicker">{assessment.subjectName}</span>
                <h3>{assessment.title}</h3>
              </div>
              <StatusBadge className={`academic-status--${assessment.status}`} label={assessmentStatusLabel(assessment.status)} />
            </div>
            <dl className="academic-detail-list">
              {eventDate && <div><dt>{assessment.dueAt ? 'Entrega' : 'Data'}</dt><dd>{formatDate(eventDate)}</dd></div>}
              {assessment.weight !== undefined && assessment.weight !== null && <div><dt>Peso</dt><dd>{gradeFormatter.format(assessment.weight)}</dd></div>}
              {assessment.gradeCount !== undefined && assessment.gradeCount !== null ? (
                <div><dt>Notas lançadas</dt><dd>{assessment.gradeCount}</dd></div>
              ) : (
                <div><dt>Nota</dt><dd>{formatGrade(assessment.grade, assessment.maximumGrade)}</dd></div>
              )}
            </dl>
            {assessment.feedback && <p className="academic-feedback">{assessment.feedback}</p>}
            {onOpenSubject && (
              <button className="academic-subject-link" onClick={() => onOpenSubject(assessment.subjectId)} type="button">
                Abrir matéria
              </button>
            )}
          </article>
        )
      })}
    </div>
  )
}

function DocumentsPanel({ documents, onRequestDocument, requestingDocumentId }: {
  documents: AcademicDocument[]
  onRequestDocument?: (document: AcademicDocument) => void | Promise<void>
  requestingDocumentId?: string | null
}) {
  if (documents.length === 0) {
    return <EmptySection description="Nenhum documento ou requerimento foi enviado para este período." title="Documentos não disponíveis" />
  }

  return (
    <ul className="academic-document-list">
      {documents.map((document) => {
        const isRequesting = requestingDocumentId === document.id
        const canRequest = document.canRequest !== false && Boolean(onRequestDocument)
        return (
          <li className="academic-document-item" key={document.id}>
            <div>
              <div className="academic-document-heading">
                <h3>{document.title}</h3>
                <StatusBadge className={`academic-status--${document.status}`} label={documentStatusLabel(document.status)} />
              </div>
              {document.description && <p>{document.description}</p>}
              {document.issuedAt && <small>Atualizado em {formatDateTime(document.issuedAt)}</small>}
            </div>
            {canRequest && (
              <button
                className="button button-secondary"
                disabled={isRequesting}
                onClick={() => void onRequestDocument?.(document)}
                type="button"
              >
                {isRequesting ? 'Solicitando…' : 'Solicitar'}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function OverviewPanel({ data, onOpenSubject }: {
  data: NonNullable<AcademicLifePageProps['data']>
  onOpenSubject?: (subjectId: string) => void
}) {
  const classCount = data.classSessions.length
  const eventCount = data.calendarEvents.length
  const atRiskSubjects = new Set(
    data.attendance.filter((item) => item.status === 'risco').map((item) => item.subjectId),
  ).size

  return (
    <div className="academic-overview">
      <section className="academic-summary-grid" aria-label="Resumo dos registros disponíveis">
        <article className="academic-summary-card"><span>Matérias</span><strong>{data.subjects.length}</strong><small>registradas no período</small></article>
        <article className="academic-summary-card"><span>Eventos</span><strong>{eventCount}</strong><small>no calendário acadêmico</small></article>
        <article className="academic-summary-card"><span>Aulas</span><strong>{classCount}</strong><small>lançadas no diário</small></article>
        <article className={`academic-summary-card ${atRiskSubjects > 0 ? 'academic-summary-card--risk' : ''}`}><span>Frequência em risco</span><strong>{atRiskSubjects}</strong><small>matéria(s) sinalizada(s)</small></article>
      </section>

      <section className="academic-overview-section">
        <div className="section-heading compact">
          <div>
            <h2>Matérias do período</h2>
            <p className="muted">Apenas matérias efetivamente retornadas pela fonte acadêmica.</p>
          </div>
        </div>
        {data.subjects.length === 0 ? (
          <EmptySection description="Nenhuma matéria foi enviada para este período." title="Sem matérias registradas" />
        ) : (
          <div className="academic-subject-grid">
            {data.subjects.map((subject) => (
              <article className="academic-subject-card" key={subject.id}>
                <span className="academic-subject-kicker">{subject.code || 'Matéria'}</span>
                <h3>{subject.name}</h3>
                <dl className="academic-detail-list">
                  {subject.instructorName && <div><dt>Docente</dt><dd>{subject.instructorName}</dd></div>}
                  {subject.workloadHours !== undefined && subject.workloadHours !== null && <div><dt>Carga horária</dt><dd>{subject.workloadHours}h</dd></div>}
                </dl>
                {onOpenSubject && (
                  <button className="academic-subject-link" onClick={() => onOpenSubject(subject.id)} type="button">
                    Abrir matéria
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * Página de apresentação: o componente pai consulta a API e envia somente os dados que
 * a origem realmente fornece; o servidor continua responsável pelo controle de acesso.
 */
export function AcademicLifePage({
  data,
  errorMessage,
  loadState,
  onOpenSubject,
  onPeriodChange,
  onRequestDocument,
  onRetry,
  refreshing = false,
  requestingDocumentId,
  viewer,
}: AcademicLifePageProps) {
  const [activeSection, setActiveSection] = useState<AcademicSection>('visao-geral')

  const sortedEvents = useMemo(() => data ? sortByTimestamp(data.calendarEvents) : [], [data])
  const sortedSessions = useMemo(() => data ? sortByTimestamp(data.classSessions) : [], [data])
  const sortedAssessments = useMemo(() => data ? sortByTimestamp(data.assessments) : [], [data])

  const handleSectionChange = useCallback((section: AcademicSection) => {
    setActiveSection(section)
  }, [])

  const panelId = 'academic-life-panel'

  return (
    <section className="page-stack academic-life-page">
      <AcademicHeader data={data} viewer={viewer} />

      {loadState === 'loading' && !data && (
        <div aria-live="polite" className="loading-state academic-loading-state" role="status">
          Carregando registros acadêmicos…
        </div>
      )}

      {loadState === 'error' && !data && (
        <section className="card academic-error-state" role="alert">
          <h2>Não foi possível carregar a vida acadêmica</h2>
          <p>{errorMessage || 'Tente novamente em alguns instantes.'}</p>
          {onRetry && <button className="button button-primary" onClick={onRetry} type="button">Tentar novamente</button>}
        </section>
      )}

      {data && (
        <>
          {loadState === 'error' && errorMessage && <div className="alert alert-error" role="alert">{errorMessage}</div>}
          {refreshing && <p aria-live="polite" className="academic-refreshing" role="status">Atualizando registros acadêmicos…</p>}

          <section aria-label="Contexto do período" className="card academic-period-card">
            <div>
              <p className="eyebrow">Período letivo</p>
              <h2>{data.period.label}</h2>
              <p className="muted">
                {data.period.startsAt || data.period.endsAt
                  ? `${formatDate(data.period.startsAt)} — ${formatDate(data.period.endsAt)}`
                  : 'As datas do período ainda não foram fornecidas pela fonte acadêmica.'}
              </p>
            </div>
            <div className="academic-period-controls">
              {data.period.status && <span className="academic-period-status">{data.period.status}</span>}
              {data.periodOptions && data.periodOptions.length > 1 && onPeriodChange && (
                <label className="academic-period-select">
                  Consultar período
                  <select onChange={(event) => onPeriodChange(event.target.value)} value={data.period.id}>
                    {data.periodOptions.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          </section>

          <div aria-label="Seções da vida acadêmica" className="academic-section-tabs" role="tablist">
            {sectionOptions.map((section) => (
              <button
                aria-controls={panelId}
                aria-selected={section.id === activeSection}
                className={section.id === activeSection ? 'academic-section-tab active' : 'academic-section-tab'}
                id={`academic-tab-${section.id}`}
                key={section.id}
                onClick={() => handleSectionChange(section.id)}
                role="tab"
                type="button"
              >
                {section.label}
              </button>
            ))}
          </div>

          <section aria-labelledby={`academic-tab-${activeSection}`} className="card academic-content-card" id={panelId} role="tabpanel" tabIndex={0}>
            {activeSection === 'visao-geral' && <OverviewPanel data={data} onOpenSubject={onOpenSubject} />}
            {activeSection === 'calendario' && <CalendarPanel events={sortedEvents} onOpenSubject={onOpenSubject} />}
            {activeSection === 'diario' && <DiaryPanel onOpenSubject={onOpenSubject} sessions={sortedSessions} />}
            {activeSection === 'frequencia' && <AttendancePanel attendance={data.attendance} />}
            {activeSection === 'avaliacoes' && <AssessmentPanel assessments={sortedAssessments} onOpenSubject={onOpenSubject} />}
            {activeSection === 'documentos' && <DocumentsPanel documents={data.documents} onRequestDocument={onRequestDocument} requestingDocumentId={requestingDocumentId} />}
          </section>

          {data.updatedAt && <p className="academic-updated-at">Dados fornecidos pela fonte acadêmica em {formatDateTime(data.updatedAt)}.</p>}
        </>
      )}
    </section>
  )
}

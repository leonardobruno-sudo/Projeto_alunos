/** Papel de `AcademicLifePage`: apresenta uma área do sistema e coordena seus componentes, estado local e chamadas à API conforme as permissões da pessoa usuária.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

/** Conecta a API autorizada de Vida Acadêmica à funcionalidade visual correspondente. */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AcademicLifePage as AcademicLifeView, AcademicManagementPanel } from '../features/academics'
import { AcademicRecordMaintenancePanel } from '../features/academics/AcademicRecordMaintenance'
import type {
  AcademicAttendance,
  AcademicDiaryEnrollment,
  AcademicLifeData,
  AcademicLifeLoadState,
} from '../features/academics'
import type {
  AcademicCalendarApi,
  AcademicDiaryApi,
  AcademicLifeOverviewApi,
  AcademicProfessorApi,
  CreateAcademicCalendarEventPayload,
} from '../features/academics/academicApiTypes'
import type { User } from '../types'
import { api } from '../utils/api'

interface AcademicLifeRoutePageProps {
  user: User
  onMessage: (message: string) => void
  onError: (error: unknown) => string
}

interface DiarySetupPanelProps {
  onCreate: (payload: { curso: string; turma: string; disciplina: string; professorUsuarioId: number; matriculas: string[] }) => Promise<void>
  period: number
  professors: AcademicProfessorApi[]
  professorsError: string
  user: User
}

interface CalendarSetupPanelProps {
  calendars: AcademicCalendarApi[]
  onCreateCalendar: (payload: { titulo: string; curso: string; turma: string; inicioEm: string; fimEm: string }) => Promise<void>
  onCreateEvent: (calendarId: number, payload: CreateAcademicCalendarEventPayload) => Promise<void>
  period: number
  user: User
}

function isStaff(user: User): boolean {
  return ['Admin', 'Diretor', 'Coordenador', 'Professor'].includes(user.role)
}

function canManageCalendar(user: User): boolean {
  return ['Admin', 'Diretor', 'Coordenador'].includes(user.role)
}

function canManageDiaryConfiguration(user: User): boolean {
  return ['Admin', 'Diretor', 'Coordenador'].includes(user.role)
}

function sameScopeValue(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalize = (value: string | null | undefined) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR')
  return normalize(left) === normalize(right)
}

function isProfessorCompatibleWithDiary(
  professor: AcademicProfessorApi,
  course: string,
  className: string,
  subject: string,
): boolean {
  return sameScopeValue(professor.curso, course) &&
    sameScopeValue(professor.turma, className) &&
    sameScopeValue(professor.disciplina, subject)
}

function toIsoDate(value: string): string {
  // A API armazena datas acadêmicas, não instantes. Usar o meio-dia local impede que
  // uma data sem horário recue um dia em fusos a oeste do UTC.
  return `${dateOnly(value)}T12:00:00`
}

function dateOnly(value: string | null | undefined): string {
  return String(value || '').slice(0, 10)
}

function eventKind(value: string): 'letivo' | 'avaliacao' | 'recesso' | 'prazo' | 'outro' {
  const kinds: Record<string, 'letivo' | 'avaliacao' | 'recesso' | 'prazo' | 'outro'> = {
    Academico: 'letivo',
    Avaliacao: 'avaliacao',
    Prazo: 'prazo',
    Reuniao: 'outro',
    Outro: 'outro',
  }
  return kinds[value] ?? 'outro'
}

function requestStatus(value: string): 'disponivel' | 'em_analise' | 'indisponivel' {
  if (value === 'CONCLUIDO') return 'disponivel'
  if (value === 'INDEFERIDO' || value === 'ARQUIVADO') return 'indisponivel'
  return 'em_analise'
}

function latestTimestamp(raw: AcademicLifeOverviewApi): string | undefined {
  const values = [
    ...raw.calendars.map((item) => item.atualizadoEm),
    ...raw.calendarEvents.map((item) => item.atualizadoEm),
    ...raw.diaries.map((item) => item.atualizadoEm),
    ...raw.classSessions.map((item) => item.atualizadoEm),
    ...raw.attendance.map((item) => item.atualizadoEm),
    ...raw.assessments.map((item) => item.atualizadoEm),
    ...raw.grades.map((item) => item.atualizadoEm),
    ...raw.documents.map((item) => item.atualizadoEm),
    ...raw.requests.map((item) => item.atualizadoEm),
  ].filter(Boolean)
  return values.sort().at(-1)
}

function toDiaryEnrollments(raw: AcademicLifeOverviewApi): AcademicDiaryEnrollment[] {
  return (raw.diaryEnrollments ?? []).map((enrollment) => ({
    diaryId: String(enrollment.diarioId),
    matricula: enrollment.matricula,
    name: enrollment.nome,
    active: enrollment.ativa,
  }))
}

function toAcademicLifeData(raw: AcademicLifeOverviewApi, user: User): AcademicLifeData {
  const diaryById = new Map(raw.diaries.map((diary) => [diary.id, diary]))
  const gradesByAssessment = new Map(raw.grades.map((grade) => [grade.avaliacaoId, grade]))
  const gradeCountByAssessment = new Map<number, number>()
  raw.grades.forEach((grade) => {
    gradeCountByAssessment.set(grade.avaliacaoId, (gradeCountByAssessment.get(grade.avaliacaoId) ?? 0) + 1)
  })
  const staffView = user.role !== 'Aluno'
  const attendance: AcademicAttendance[] = (raw.attendanceSummaries ?? []).flatMap((summary) => {
    const diary = diaryById.get(summary.diarioId)
    if (!diary) return []
    return [{
      subjectId: String(summary.diarioId),
      subjectName: diary.disciplina,
      studentMatricula: staffView ? summary.matricula : null,
      totalClasses: summary.totalClasses,
      registeredClasses: summary.registeredClasses,
      attendedClasses: summary.attendedClasses,
      missedClasses: summary.missedClasses,
      justifiedAbsences: summary.justifiedAbsences,
      absencePercent: summary.absencePercent,
      status: summary.status,
    }]
  })

  return {
    period: {
      id: String(raw.period),
      label: raw.currentPeriodName,
      status: 'Registros do período',
    },
    periodOptions: raw.periodOptions.map((label, index) => ({
      id: String(index),
      label,
      current: index === raw.period,
    })),
    scopeLabel: raw.scopeLabel,
    subjects: raw.diaries.map((diary) => ({
      id: String(diary.id),
      name: diary.disciplina,
      code: diary.turma,
      instructorName: diary.professorNome,
      workloadHours: raw.classSessions
        .filter((lesson) => lesson.diarioId === diary.id)
        .reduce((total, lesson) => total + lesson.cargaHoraria, 0),
    })),
    calendarEvents: raw.calendarEvents.map((event) => {
      const calendar = raw.calendars.find((item) => item.id === event.calendarioId)
      return {
        id: String(event.id),
        title: event.titulo,
        kind: eventKind(event.tipo),
        startsAt: toIsoDate(event.inicioEm),
        endsAt: toIsoDate(event.fimEm),
        allDay: true,
        description: event.descricao,
        subjectName: calendar?.titulo ?? null,
      }
    }),
    classSessions: raw.classSessions.map((lesson) => {
      const diary = diaryById.get(lesson.diarioId)
      return {
        id: String(lesson.id),
        subjectId: String(lesson.diarioId),
        subjectName: diary?.disciplina ?? 'Matéria não informada',
        startsAt: toIsoDate(lesson.dataAula),
        allDay: true,
        status: 'realizada' as const,
        instructorName: diary?.professorNome ?? null,
        content: lesson.conteudo || lesson.titulo,
      }
    }),
    attendance,
    assessments: raw.assessments.map((assessment) => {
      const diary = diaryById.get(assessment.diarioId)
      const grade = user.role === 'Aluno' ? gradesByAssessment.get(assessment.id) : undefined
      const gradeCount = gradeCountByAssessment.get(assessment.id) ?? 0
      return {
        id: String(assessment.id),
        subjectId: String(assessment.diarioId),
        subjectName: diary?.disciplina ?? 'Matéria não informada',
        title: assessment.titulo,
        status: grade || (user.role !== 'Aluno' && gradeCount > 0) ? 'corrigida' as const : 'prevista' as const,
        occursAt: toIsoDate(assessment.dataAvaliacao),
        grade: grade?.nota ?? null,
        gradeCount: user.role !== 'Aluno' ? gradeCount : undefined,
        maximumGrade: assessment.notaMaxima,
        weight: assessment.peso,
        feedback: grade?.observacao ?? assessment.descricao,
      }
    }),
    documents: [
      ...raw.documents.map((document) => ({
        id: `document-${document.id}`,
        title: document.titulo,
        description: document.descricao || document.tipo,
        status: requestStatus(document.status),
        issuedAt: document.atualizadoEm,
        canRequest: false,
      })),
      ...raw.requests.map((request) => ({
        id: `request-${request.id}`,
        title: `Requerimento: ${request.tipo}`,
        description: request.descricao,
        status: requestStatus(request.status),
        issuedAt: request.atualizadoEm,
        canRequest: false,
      })),
    ],
    updatedAt: latestTimestamp(raw),
  }
}

function DiarySetupPanel({ onCreate, period, professors, professorsError, user }: DiarySetupPanelProps) {
  const [curso, setCurso] = useState(user.curso ?? '')
  const [turma, setTurma] = useState('')
  const [disciplina, setDisciplina] = useState('')
  const [professorUsuarioId, setProfessorUsuarioId] = useState('')
  const [matriculas, setMatriculas] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const courseLocked = user.role !== 'Admin'
  const compatibleProfessors = useMemo(
    () => professors.filter((professor) => isProfessorCompatibleWithDiary(professor, curso, turma, disciplina)),
    [curso, disciplina, professors, turma],
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const normalizedMatriculas = matriculas.split(/[;,\n]/).map((value) => value.trim()).filter(Boolean)
    if (!curso.trim() || !turma.trim() || !disciplina.trim()) {
      setError('Curso, turma e matéria são obrigatórios para criar o diário.')
      return
    }
    const parsedProfessorId = Number(professorUsuarioId)
    if (!Number.isInteger(parsedProfessorId) || parsedProfessorId < 1) {
      setError('Selecione o professor responsável pelo diário.')
      return
    }
    setSaving(true)
    try {
      await onCreate({
        curso: curso.trim(),
        turma: turma.trim(),
        disciplina: disciplina.trim(),
        professorUsuarioId: parsedProfessorId,
        matriculas: normalizedMatriculas,
      })
      setTurma('')
      setDisciplina('')
      setProfessorUsuarioId('')
      setMatriculas('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível criar o diário.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card academic-management-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Diário</p>
          <h2>Abrir diário de turma</h2>
          <p className="muted">Período: {period + 1}. Informe as matrículas apenas dos alunos que devem acompanhar este diário.</p>
        </div>
      </div>
      <form className="academic-management-form" onSubmit={(event) => void submit(event)}>
        <div className="academic-form-grid">
          <label>Curso
            <input disabled={courseLocked} onChange={(event) => { setCurso(event.target.value); setProfessorUsuarioId('') }} required value={curso} />
          </label>
          <label>Turma
            <input onChange={(event) => { setTurma(event.target.value); setProfessorUsuarioId('') }} required value={turma} />
          </label>
          <label>Matéria
            <input onChange={(event) => { setDisciplina(event.target.value); setProfessorUsuarioId('') }} required value={disciplina} />
          </label>
          <label>Professor responsável
            <select disabled={compatibleProfessors.length === 0} onChange={(event) => setProfessorUsuarioId(event.target.value)} required value={professorUsuarioId}>
              <option value="">Selecione um professor</option>
              {compatibleProfessors.map((professor) => <option key={professor.id} value={professor.id}>{professor.nome} ({professor.username})</option>)}
            </select>
          </label>
          <label className="academic-field-wide">Matrículas (opcional)
            <textarea onChange={(event) => setMatriculas(event.target.value)} placeholder="Uma por linha, vírgula ou ponto e vírgula" value={matriculas} />
          </label>
        </div>
        {professorsError && <div className="alert alert-error" role="alert">{professorsError}</div>}
        {!professorsError && curso.trim() && turma.trim() && disciplina.trim() && compatibleProfessors.length === 0 && (
          <p className="muted">Nenhum professor com este curso, turma e matéria está disponível para atribuição.</p>
        )}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="form-actions"><button className="button button-primary" disabled={saving || compatibleProfessors.length === 0} type="submit">{saving ? 'Criando…' : 'Criar diário'}</button></div>
      </form>
    </section>
  )
}

function DiaryResponsibilityPanel({ diaries, onAssign, professors, professorsError }: {
  diaries: AcademicDiaryApi[]
  onAssign: (diaryId: number, professorUsuarioId: number) => Promise<void>
  professors: AcademicProfessorApi[]
  professorsError: string
}) {
  const [diaryId, setDiaryId] = useState('')
  const [professorUsuarioId, setProfessorUsuarioId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedDiary = diaries.find((diary) => diary.id === Number(diaryId))
  const compatibleProfessors = useMemo(
    () => selectedDiary
      ? professors.filter((professor) => isProfessorCompatibleWithDiary(professor, selectedDiary.curso, selectedDiary.turma, selectedDiary.disciplina))
      : [],
    [professors, selectedDiary],
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const selectedDiaryId = Number(diaryId)
    const selectedProfessorId = Number(professorUsuarioId)
    if (!Number.isInteger(selectedDiaryId) || !Number.isInteger(selectedProfessorId)) {
      setError('Selecione o diário e o professor responsável.')
      return
    }
    setSaving(true)
    try {
      await onAssign(selectedDiaryId, selectedProfessorId)
      setDiaryId('')
      setProfessorUsuarioId('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atribuir o professor.')
    } finally {
      setSaving(false)
    }
  }

  if (diaries.length === 0) return null

  return (
    <section className="card academic-management-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Responsabilidade</p>
          <h2>Atribuir professor ao diário</h2>
          <p className="muted">Apenas o professor formalmente atribuído poderá lançar aulas, frequências e notas.</p>
        </div>
      </div>
      <form className="academic-management-form" onSubmit={(event) => void submit(event)}>
        <div className="academic-form-grid">
          <label className="academic-field-wide">Diário
            <select onChange={(event) => { setDiaryId(event.target.value); setProfessorUsuarioId('') }} required value={diaryId}>
              <option value="">Selecione um diário</option>
              {diaries.map((diary) => <option key={diary.id} value={diary.id}>{diary.disciplina} · {diary.turma} · {diary.professorNome || 'Sem responsável'}</option>)}
            </select>
          </label>
          <label>Professor responsável
            <select disabled={!selectedDiary || compatibleProfessors.length === 0} onChange={(event) => setProfessorUsuarioId(event.target.value)} required value={professorUsuarioId}>
              <option value="">Selecione um professor</option>
              {compatibleProfessors.map((professor) => <option key={professor.id} value={professor.id}>{professor.nome} ({professor.username})</option>)}
            </select>
          </label>
        </div>
        {professorsError && <div className="alert alert-error" role="alert">{professorsError}</div>}
        {!professorsError && selectedDiary && compatibleProfessors.length === 0 && <p className="muted">Não há professor cadastrado para o escopo deste diário.</p>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="form-actions"><button className="button button-primary" disabled={saving || !selectedDiary || compatibleProfessors.length === 0} type="submit">{saving ? 'Atribuindo…' : 'Salvar responsável'}</button></div>
      </form>
    </section>
  )
}

function CalendarSetupPanel({ calendars, onCreateCalendar, onCreateEvent, period, user }: CalendarSetupPanelProps) {
  const [course, setCourse] = useState(user.curso ?? '')
  const [className, setClassName] = useState('')
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [calendarId, setCalendarId] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [eventType, setEventType] = useState<CreateAcademicCalendarEventPayload['tipo']>('Academico')
  const [eventStart, setEventStart] = useState('')
  const [eventEnd, setEventEnd] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<'calendar' | 'event' | null>(null)
  const courseLocked = user.role !== 'Admin'

  async function createCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!course.trim() || !title.trim() || !startsAt || !endsAt) {
      setError('Título, curso, início e término são obrigatórios.')
      return
    }
    setSaving('calendar')
    try {
      await onCreateCalendar({ titulo: title.trim(), curso: course.trim(), turma: className.trim(), inicioEm: startsAt, fimEm: endsAt })
      setTitle('')
      setClassName('')
      setStartsAt('')
      setEndsAt('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível criar o calendário.')
    } finally {
      setSaving(null)
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const parsedCalendarId = Number(calendarId)
    if (!Number.isInteger(parsedCalendarId) || !eventTitle.trim() || !eventStart || !eventEnd) {
      setError('Selecione um calendário e informe título, início e término do evento.')
      return
    }
    setSaving('event')
    try {
      await onCreateEvent(parsedCalendarId, {
        titulo: eventTitle.trim(),
        descricao: eventDescription.trim(),
        tipo: eventType,
        inicioEm: eventStart,
        fimEm: eventEnd,
      })
      setEventTitle('')
      setEventDescription('')
      setEventStart('')
      setEventEnd('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível criar o evento.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="card academic-management-panel">
      <div className="section-heading compact"><div><p className="eyebrow">Calendário</p><h2>Planejamento do período</h2><p className="muted">Crie calendários e eventos somente dentro do curso autorizado.</p></div></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <form className="academic-management-form" onSubmit={(event) => void createCalendar(event)}>
        <div className="academic-form-heading"><div><h3>Novo calendário</h3><p>Período: {period + 1}</p></div></div>
        <div className="academic-form-grid">
          <label>Título<input onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
          <label>Curso<input disabled={courseLocked} onChange={(event) => setCourse(event.target.value)} required value={course} /></label>
          <label>Turma (opcional)<input onChange={(event) => setClassName(event.target.value)} value={className} /></label>
          <label>Início<input onChange={(event) => setStartsAt(event.target.value)} required type="date" value={startsAt} /></label>
          <label>Término<input onChange={(event) => setEndsAt(event.target.value)} required type="date" value={endsAt} /></label>
        </div>
        <div className="form-actions"><button className="button button-primary" disabled={saving !== null} type="submit">{saving === 'calendar' ? 'Criando…' : 'Criar calendário'}</button></div>
      </form>
      {calendars.length > 0 && (
        <form className="academic-management-form" onSubmit={(event) => void createEvent(event)}>
          <div className="academic-form-heading"><div><h3>Novo evento</h3><p>O evento precisa ficar dentro do intervalo do calendário selecionado.</p></div></div>
          <div className="academic-form-grid">
            <label className="academic-field-wide">Calendário
              <select onChange={(event) => setCalendarId(event.target.value)} required value={calendarId}>
                <option value="">Selecione um calendário</option>
                {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.titulo} · {calendar.curso}{calendar.turma ? ` · ${calendar.turma}` : ''}</option>)}
              </select>
            </label>
            <label>Título<input onChange={(event) => setEventTitle(event.target.value)} required value={eventTitle} /></label>
            <label>Tipo
              <select onChange={(event) => setEventType(event.target.value as CreateAcademicCalendarEventPayload['tipo'])} value={eventType}>
                <option value="Academico">Evento acadêmico</option><option value="Avaliacao">Avaliação</option><option value="Prazo">Prazo</option><option value="Reuniao">Reunião</option><option value="Outro">Outro</option>
              </select>
            </label>
            <label>Início<input onChange={(event) => setEventStart(event.target.value)} required type="date" value={eventStart} /></label>
            <label>Término<input onChange={(event) => setEventEnd(event.target.value)} required type="date" value={eventEnd} /></label>
            <label className="academic-field-wide">Descrição (opcional)<textarea onChange={(event) => setEventDescription(event.target.value)} value={eventDescription} /></label>
          </div>
          <div className="form-actions"><button className="button button-primary" disabled={saving !== null} type="submit">{saving === 'event' ? 'Adicionando…' : 'Adicionar evento'}</button></div>
        </form>
      )}
    </section>
  )
}

function StudentRequestPanel({ onCreate, period }: {
  onCreate: (payload: { tipo: string; descricao: string; periodo: number }) => Promise<void>
  period: number
}) {
  const [type, setType] = useState('DECLARACAO_MATRICULA')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onCreate({ tipo: type, descricao: description.trim(), periodo: period })
      setDescription('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível enviar o requerimento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card academic-management-panel">
      <div className="section-heading compact"><div><p className="eyebrow">Atendimento acadêmico</p><h2>Novo requerimento</h2><p className="muted">O requerimento será associado ao período selecionado. Acompanhe o status na seção Documentos desta página.</p></div></div>
      <form className="academic-management-form" onSubmit={(event) => void submit(event)}>
        <div className="academic-form-grid">
          <label>Tipo
            <select onChange={(event) => setType(event.target.value)} value={type}>
              <option value="DECLARACAO_MATRICULA">Declaração de matrícula</option>
              <option value="HISTORICO_PARCIAL">Histórico parcial</option>
              <option value="APROVEITAMENTO_ESTUDOS">Aproveitamento de estudos</option>
              <option value="OUTRO">Outro</option>
            </select>
          </label>
          <label className="academic-field-wide">Observação (opcional)<textarea onChange={(event) => setDescription(event.target.value)} value={description} /></label>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="form-actions"><button className="button button-primary" disabled={saving} type="submit">{saving ? 'Enviando…' : 'Enviar requerimento'}</button></div>
      </form>
    </section>
  )
}

export function AcademicLifeRoutePage({ user, onError, onMessage }: AcademicLifeRoutePageProps) {
  const [period, setPeriod] = useState(0)
  const [requestedPeriod, setRequestedPeriod] = useState(0)
  const [rawData, setRawData] = useState<AcademicLifeOverviewApi | null>(null)
  const [loadState, setLoadState] = useState<AcademicLifeLoadState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [professors, setProfessors] = useState<AcademicProfessorApi[]>([])
  const [professorsError, setProfessorsError] = useState('')
  const latestLoadId = useRef(0)

  const load = useCallback(async (requestedPeriod: number, keepCurrentData = false) => {
    const loadId = latestLoadId.current + 1
    latestLoadId.current = loadId
    setRequestedPeriod(requestedPeriod)
    setLoadState(keepCurrentData ? 'ready' : 'loading')
    setRefreshing(keepCurrentData)
    setErrorMessage('')
    try {
      const overview = await api.getAcademicLife(requestedPeriod)
      if (loadId !== latestLoadId.current) return
      setRawData(overview.data)
      setPeriod(overview.data.period)
      setLoadState('ready')
    } catch (requestError) {
      if (loadId !== latestLoadId.current) return
      const message = onError(requestError)
      setErrorMessage(keepCurrentData ? `${message} Os dados exibidos são do último período carregado.` : message)
      setLoadState('error')
    } finally {
      if (loadId === latestLoadId.current) setRefreshing(false)
    }
  }, [onError])

  useEffect(() => {
    void load(0)
  }, [load, user.id, user.role])

  useEffect(() => {
    let active = true
    if (!canManageDiaryConfiguration(user)) {
      setProfessors([])
      setProfessorsError('')
      return () => { active = false }
    }
    setProfessorsError('')
    void api.getAcademicAssignableProfessors()
      .then((result) => {
        if (active) setProfessors(result.data)
      })
      .catch((requestError) => {
        if (active) {
          setProfessors([])
          setProfessorsError(onError(requestError))
        }
      })
    return () => { active = false }
  }, [onError, user])

  const data = useMemo(() => rawData ? toAcademicLifeData(rawData, user) : null, [rawData, user])
  const enrollments = useMemo(() => rawData ? toDiaryEnrollments(rawData) : [], [rawData])
  const staffCanManage = isStaff(user)

  async function runMutation(action: () => Promise<{ message: string }>, fallbackMessage: string) {
    try {
      const result = await action()
      onMessage(result.message || fallbackMessage)
      await load(period, true)
    } catch (requestError) {
      throw new Error(onError(requestError))
    }
  }

  return (
    <section className="page-stack">
      <AcademicLifeView
        data={data}
        errorMessage={errorMessage}
        loadState={loadState}
        onOpenSubject={() => { window.location.hash = 'materias' }}
        onPeriodChange={(nextPeriod) => void load(Number(nextPeriod), Boolean(rawData))}
        onRetry={() => void load(requestedPeriod, Boolean(rawData))}
        refreshing={refreshing}
        viewer={{ id: user.id, name: user.nome || user.username, role: user.role }}
      />

      {rawData && canManageCalendar(user) && (
        <CalendarSetupPanel
          calendars={rawData.calendars}
          onCreateCalendar={(payload) => runMutation(
            () => api.createAcademicCalendar({ ...payload, periodo: period }),
            'Calendário acadêmico criado com sucesso.',
          )}
          onCreateEvent={(calendarId, payload) => runMutation(
            () => api.createAcademicCalendarEvent(calendarId, payload),
            'Evento acadêmico criado com sucesso.',
          )}
          period={period}
          user={user}
        />
      )}

      {rawData && canManageDiaryConfiguration(user) && (
        <DiarySetupPanel
          onCreate={(payload) => runMutation(
            () => api.createAcademicDiary({
              curso: payload.curso,
              turma: payload.turma,
              disciplina: payload.disciplina,
              periodo: period,
              professorUsuarioId: payload.professorUsuarioId,
              ...(payload.matriculas.length > 0 ? { matriculas: payload.matriculas } : {}),
            }),
            'Diário criado com sucesso.',
          )}
          period={period}
          professors={professors}
          professorsError={professorsError}
          user={user}
        />
      )}

      {rawData && canManageDiaryConfiguration(user) && (
        <DiaryResponsibilityPanel
          diaries={rawData.diaries}
          onAssign={(diaryId, professorUsuarioId) => runMutation(
            () => api.updateAcademicDiary(diaryId, { professorUsuarioId }),
            'Professor responsável atualizado com sucesso.',
          )}
          professors={professors}
          professorsError={professorsError}
        />
      )}

      {rawData && (
        <AcademicRecordMaintenancePanel
          assessments={rawData.assessments}
          calendarEvents={rawData.calendarEvents}
          calendars={rawData.calendars}
          classSessions={rawData.classSessions}
          documents={rawData.documents}
          onArchiveDocument={canManageDiaryConfiguration(user) ? (id) => runMutation(
            () => api.archiveAcademicDocument(id),
            'Documento acadêmico arquivado com sucesso.',
          ) : undefined}
          onDeleteAssessment={staffCanManage ? (id) => runMutation(
            () => api.deleteAcademicAssessment(id),
            'Avaliação e notas vinculadas removidas com sucesso.',
          ) : undefined}
          onDeleteCalendar={canManageCalendar(user) ? (id) => runMutation(
            () => api.deleteAcademicCalendar(id),
            'Calendário e eventos vinculados removidos com sucesso.',
          ) : undefined}
          onDeleteEvent={canManageCalendar(user) ? (id) => runMutation(
            () => api.deleteAcademicCalendarEvent(id),
            'Evento acadêmico removido com sucesso.',
          ) : undefined}
          onDeleteLesson={staffCanManage ? (id) => runMutation(
            () => api.deleteAcademicLesson(id),
            'Aula e frequências vinculadas removidas com sucesso.',
          ) : undefined}
          onDeleteRequest={canManageDiaryConfiguration(user) ? (id) => runMutation(
            () => api.deleteAcademicRequest(id),
            'Requerimento acadêmico removido com sucesso.',
          ) : undefined}
          onUpdateAssessment={staffCanManage ? (id, payload) => runMutation(
            () => api.updateAcademicAssessment(id, payload),
            'Avaliação atualizada com sucesso.',
          ) : undefined}
          onUpdateCalendar={canManageCalendar(user) ? (id, payload) => runMutation(
            () => api.updateAcademicCalendar(id, payload),
            'Calendário atualizado com sucesso.',
          ) : undefined}
          onUpdateDocument={canManageDiaryConfiguration(user) ? (id, payload) => runMutation(
            () => api.updateAcademicDocument(id, payload),
            'Documento acadêmico atualizado com sucesso.',
          ) : undefined}
          onUpdateEvent={canManageCalendar(user) ? (id, payload) => runMutation(
            () => api.updateAcademicCalendarEvent(id, payload),
            'Evento acadêmico atualizado com sucesso.',
          ) : undefined}
          onUpdateLesson={staffCanManage ? (id, payload) => runMutation(
            () => api.updateAcademicLesson(id, payload),
            'Aula atualizada com sucesso.',
          ) : undefined}
          onUpdateRequest={canManageDiaryConfiguration(user) ? (id, payload) => runMutation(
            () => api.updateAcademicRequest(id, payload),
            'Requerimento atualizado com sucesso.',
          ) : undefined}
          requests={rawData.requests}
        />
      )}

      {data && rawData && staffCanManage && (
        <AcademicManagementPanel
          assessments={data.assessments}
          classSessions={data.classSessions}
          onCreateAssessment={(input) => runMutation(
            () => api.createAcademicAssessment(Number(input.subjectId), {
              titulo: input.title,
              dataAvaliacao: dateOnly(input.occursAt),
              peso: input.weight ?? undefined,
              notaMaxima: input.maximumGrade ?? undefined,
            }),
            'Avaliação lançada com sucesso.',
          )}
          onCreateClassSession={(input) => runMutation(
            () => api.createAcademicLesson(Number(input.subjectId), {
              titulo: input.title,
              dataAula: dateOnly(input.startsAt),
              conteudo: input.content,
            }),
            'Aula lançada com sucesso.',
          )}
          onRecordAttendance={(input) => runMutation(
            () => api.setAcademicAttendance(Number(input.classSessionId), input.studentMatricula, {
              situacao: input.status === 'presente' ? 'PRESENTE' : input.status === 'ausente' ? 'FALTA' : 'JUSTIFICADA',
            }),
            'Frequência lançada com sucesso.',
          )}
          onRecordGrade={(input) => runMutation(
            () => api.setAcademicGrade(Number(input.assessmentId), input.studentMatricula, {
              nota: input.grade,
              observacao: input.feedback,
            }),
            'Nota lançada com sucesso.',
          )}
          onEnrollStudents={canManageDiaryConfiguration(user) ? (input) => runMutation(
            () => api.enrollAcademicStudents(Number(input.subjectId), { matriculas: input.matriculas }),
            'Matrículas do diário atualizadas com sucesso.',
          ) : undefined}
          enrollments={enrollments}
          period={data.period}
          subjects={data.subjects}
        />
      )}

      {user.role === 'Aluno' && rawData && (
        <StudentRequestPanel
          onCreate={(payload) => runMutation(
            () => api.createAcademicRequest(payload),
            'Requerimento enviado com sucesso.',
          )}
          period={period}
        />
      )}
    </section>
  )
}

/** Papel de `AcademicManagementPanel`: agrupa uma funcionalidade do produto e integra sua apresentação com os tipos e serviços que a alimentam.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

/**
 * Formulários de gestão usados pela tela de Vida Acadêmica para preparar registros.
 * Recebe as opções e ações da página; entrega rascunhos validados de calendário,
 * aula, frequência, avaliação ou matrícula ao componente que chama a API.
 * As permissões finais são sempre verificadas novamente no servidor.
 */

import { useMemo, useState, type FormEvent } from 'react'
import type {
  AcademicAttendanceInput,
  AcademicCalendarEventInput,
  AcademicEnrollmentInput,
  AcademicGradeInput,
  AcademicManagementPanelProps,
} from './academicTypes'
import './AcademicLifePage.css'

type ManagementFormId = 'calendario' | 'aula' | 'frequencia' | 'avaliacao' | 'nota' | 'matriculas'

interface ManagementOption {
  id: ManagementFormId
  label: string
}

interface CalendarDraft {
  title: string
  kind: AcademicCalendarEventInput['kind']
  startsAt: string
  endsAt: string
  allDay: boolean
  description: string
  subjectId: string
}

interface ClassSessionDraft {
  subjectId: string
  title: string
  startsAt: string
  content: string
}

interface AttendanceDraft {
  classSessionId: string
  studentMatricula: string
  status: AcademicAttendanceInput['status']
}

interface AssessmentDraft {
  subjectId: string
  title: string
  date: string
  maximumGrade: string
  weight: string
}

interface GradeDraft {
  assessmentId: string
  studentMatricula: string
  grade: string
  feedback: string
}

interface EnrollmentDraft {
  subjectId: string
  matriculas: string
}

const emptyCalendarDraft: CalendarDraft = {
  title: '',
  kind: 'letivo',
  startsAt: '',
  endsAt: '',
  allDay: false,
  description: '',
  subjectId: '',
}

const emptyClassSessionDraft: ClassSessionDraft = {
  subjectId: '',
  title: '',
  startsAt: '',
  content: '',
}

const emptyAttendanceDraft: AttendanceDraft = {
  classSessionId: '',
  studentMatricula: '',
  status: 'presente',
}

const emptyAssessmentDraft: AssessmentDraft = {
  subjectId: '',
  title: '',
  date: '',
  maximumGrade: '',
  weight: '',
}

const emptyGradeDraft: GradeDraft = {
  assessmentId: '',
  studentMatricula: '',
  grade: '',
  feedback: '',
}

const emptyEnrollmentDraft: EnrollmentDraft = {
  subjectId: '',
  matriculas: '',
}

const classDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function asNullableText(value: string): string | null {
  return value.trim() || null
}

function dateInputToIso(value: string, allDay = false): string {
  const normalized = allDay ? `${value}T00:00:00` : value
  const date = new Date(normalized)
  if (!value || Number.isNaN(date.getTime())) throw new Error('Informe uma data e horário válidos.')
  return date.toISOString()
}

function optionalIso(value: string, allDay = false): string | null {
  return value.trim() ? dateInputToIso(value, allDay) : null
}

function optionalNonNegativeNumber(value: string, fieldName: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${fieldName} deve ser um número igual ou maior que zero.`)
  return parsed
}

function formatClassDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : classDateFormatter.format(date)
}

function parseMatriculas(value: string): string[] {
  const matriculas = value
    .split(/[;,\n]/)
    .map((matricula) => matricula.trim().toUpperCase())
    .filter(Boolean)
  if (matriculas.length === 0) throw new Error('Informe pelo menos uma matrícula.')
  if (new Set(matriculas).size !== matriculas.length) throw new Error('Remova as matrículas repetidas antes de salvar.')
  return matriculas
}

function requestErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Não foi possível salvar a alteração. Tente novamente.'
}

function ManagementNotice({ error, saving }: { error: string; saving: boolean }) {
  if (error) return <div className="alert alert-error" role="alert">{error}</div>
  if (saving) return <p aria-live="polite" className="academic-form-saving" role="status">Salvando registro…</p>
  return null
}

function SubjectSelect({
  id,
  label,
  onChange,
  placeholder = 'Selecione uma matéria',
  subjects,
  value,
}: {
  id: string
  label: string
  onChange: (value: string) => void
  placeholder?: string
  subjects: AcademicManagementPanelProps['subjects']
  value: string
}) {
  return (
    <label htmlFor={id}>
      {label}
      <select id={id} onChange={(event) => onChange(event.target.value)} required value={value}>
        <option value="">{placeholder}</option>
        {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
      </select>
    </label>
  )
}

function CalendarEventForm({ onCreate, subjects }: {
  onCreate: NonNullable<AcademicManagementPanelProps['onCreateCalendarEvent']>
  subjects: AcademicManagementPanelProps['subjects']
}) {
  const [draft, setDraft] = useState<CalendarDraft>(emptyCalendarDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const startsAt = dateInputToIso(draft.startsAt, draft.allDay)
      const endsAt = optionalIso(draft.endsAt, draft.allDay)
      if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
        throw new Error('O término não pode ocorrer antes do início.')
      }
      await onCreate({
        title: draft.title.trim(),
        kind: draft.kind,
        startsAt,
        endsAt,
        allDay: draft.allDay,
        description: asNullableText(draft.description),
        subjectId: asNullableText(draft.subjectId),
      })
      setDraft(emptyCalendarDraft)
    } catch (submitError) {
      setError(requestErrorMessage(submitError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="academic-management-form" onSubmit={(event) => void submit(event)}>
      <div className="academic-form-heading">
        <div><h3>Novo evento do calendário</h3><p>Cadastre somente datas confirmadas para o período selecionado.</p></div>
      </div>
      <div className="academic-form-grid">
        <label className="academic-field-wide">Título
          <input onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required value={draft.title} />
        </label>
        <label>Tipo
          <select onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as CalendarDraft['kind'] }))} value={draft.kind}>
            <option value="letivo">Evento letivo</option>
            <option value="avaliacao">Avaliação</option>
            <option value="prazo">Prazo</option>
            <option value="recesso">Recesso</option>
            <option value="outro">Outro</option>
          </select>
        </label>
        <SubjectSelect id="academic-event-subject" label="Matéria vinculada (opcional)" onChange={(subjectId) => setDraft((current) => ({ ...current, subjectId }))} subjects={subjects} value={draft.subjectId} />
        <label className="academic-checkbox-field"><input checked={draft.allDay} onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked, endsAt: '' }))} type="checkbox" /> Evento de dia inteiro</label>
        <label>Início
          <input onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} required type={draft.allDay ? 'date' : 'datetime-local'} value={draft.startsAt} />
        </label>
        <label>Término (opcional)
          <input onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} type={draft.allDay ? 'date' : 'datetime-local'} value={draft.endsAt} />
        </label>
        <label className="academic-field-wide">Descrição (opcional)
          <textarea onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} value={draft.description} />
        </label>
      </div>
      <ManagementNotice error={error} saving={saving} />
      <div className="form-actions"><button className="button button-primary" disabled={saving} type="submit">Adicionar evento</button></div>
    </form>
  )
}

function ClassSessionForm({ onCreate, subjects }: {
  onCreate: NonNullable<AcademicManagementPanelProps['onCreateClassSession']>
  subjects: AcademicManagementPanelProps['subjects']
}) {
  const [draft, setDraft] = useState<ClassSessionDraft>(emptyClassSessionDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const startsAt = dateInputToIso(draft.startsAt, true)
      await onCreate({
        subjectId: draft.subjectId,
        title: draft.title.trim(),
        startsAt,
        content: asNullableText(draft.content),
      })
      setDraft(emptyClassSessionDraft)
    } catch (submitError) {
      setError(requestErrorMessage(submitError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="academic-management-form" onSubmit={(event) => void submit(event)}>
      <div className="academic-form-heading"><div><h3>Lançar aula no diário</h3><p>A data e o conteúdo ficam registrados no diário do período.</p></div></div>
      <div className="academic-form-grid">
        <SubjectSelect id="academic-class-subject" label="Matéria" onChange={(subjectId) => setDraft((current) => ({ ...current, subjectId }))} subjects={subjects} value={draft.subjectId} />
        <label>Título da aula
          <input onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required value={draft.title} />
        </label>
        <label>Data da aula
          <input onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} required type="date" value={draft.startsAt} />
        </label>
        <label className="academic-field-wide">Conteúdo ministrado (opcional)
          <textarea onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} value={draft.content} />
        </label>
      </div>
      <ManagementNotice error={error} saving={saving} />
      <div className="form-actions"><button className="button button-primary" disabled={saving} type="submit">Lançar aula</button></div>
    </form>
  )
}

function AttendanceForm({ classSessions, enrollments, onRecord }: {
  classSessions: AcademicManagementPanelProps['classSessions']
  enrollments: AcademicManagementPanelProps['enrollments']
  onRecord: NonNullable<AcademicManagementPanelProps['onRecordAttendance']>
}) {
  const [draft, setDraft] = useState<AttendanceDraft>(emptyAttendanceDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedClass = classSessions.find((session) => session.id === draft.classSessionId)
  const availableStudents = selectedClass
    ? enrollments.filter((enrollment) => enrollment.active && enrollment.diaryId === selectedClass.subjectId)
    : []
  const hasActiveEnrollment = enrollments.some((enrollment) => enrollment.active)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onRecord(draft)
      setDraft(emptyAttendanceDraft)
    } catch (submitError) {
      setError(requestErrorMessage(submitError))
    } finally {
      setSaving(false)
    }
  }

  if (classSessions.length === 0 || !hasActiveEnrollment) {
    return <div className="academic-management-unavailable">Para registrar frequência, carregue primeiro as aulas e os alunos autorizados para este escopo.</div>
  }

  return (
    <form className="academic-management-form" onSubmit={(event) => void submit(event)}>
      <div className="academic-form-heading"><div><h3>Registrar frequência</h3><p>O registro deve corresponder a uma aula já lançada e a um aluno do seu escopo.</p></div></div>
      <div className="academic-form-grid">
        <label className="academic-field-wide">Aula
          <select onChange={(event) => setDraft((current) => ({ ...current, classSessionId: event.target.value, studentMatricula: '' }))} required value={draft.classSessionId}>
            <option value="">Selecione uma aula</option>
            {classSessions.map((session) => <option key={session.id} value={session.id}>{session.subjectName} — {formatClassDate(session.startsAt)}</option>)}
          </select>
        </label>
        <label>Aluno
          <select disabled={!selectedClass || availableStudents.length === 0} onChange={(event) => setDraft((current) => ({ ...current, studentMatricula: event.target.value }))} required value={draft.studentMatricula}>
            <option value="">Selecione um aluno</option>
            {availableStudents.map((student) => <option key={student.matricula} value={student.matricula}>{student.name} ({student.matricula})</option>)}
          </select>
        </label>
        <label>Situação
          <select onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as AttendanceDraft['status'] }))} value={draft.status}>
            <option value="presente">Presente</option>
            <option value="ausente">Ausente</option>
            <option value="justificada">Falta justificada</option>
          </select>
        </label>
      </div>
      <ManagementNotice error={error} saving={saving} />
      <div className="form-actions"><button className="button button-primary" disabled={saving} type="submit">Salvar frequência</button></div>
    </form>
  )
}

function AssessmentForm({ onCreate, subjects }: {
  onCreate: NonNullable<AcademicManagementPanelProps['onCreateAssessment']>
  subjects: AcademicManagementPanelProps['subjects']
}) {
  const [draft, setDraft] = useState<AssessmentDraft>(emptyAssessmentDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onCreate({
        subjectId: draft.subjectId,
        title: draft.title.trim(),
        occursAt: dateInputToIso(draft.date, true),
        maximumGrade: optionalNonNegativeNumber(draft.maximumGrade, 'A nota máxima'),
        weight: optionalNonNegativeNumber(draft.weight, 'O peso'),
      })
      setDraft(emptyAssessmentDraft)
    } catch (submitError) {
      setError(requestErrorMessage(submitError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="academic-management-form" onSubmit={(event) => void submit(event)}>
      <div className="academic-form-heading"><div><h3>Nova avaliação</h3><p>A nota só deve ser informada depois em um fluxo de correção autorizado.</p></div></div>
      <div className="academic-form-grid">
        <SubjectSelect id="academic-assessment-subject" label="Matéria" onChange={(subjectId) => setDraft((current) => ({ ...current, subjectId }))} subjects={subjects} value={draft.subjectId} />
        <label>Título
          <input onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required value={draft.title} />
        </label>
        <label>Data
          <input onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} required type="date" value={draft.date} />
        </label>
        <label>Nota máxima (opcional)
          <input inputMode="decimal" min="0" onChange={(event) => setDraft((current) => ({ ...current, maximumGrade: event.target.value }))} step="0.01" type="number" value={draft.maximumGrade} />
        </label>
        <label>Peso (opcional)
          <input inputMode="decimal" min="0" onChange={(event) => setDraft((current) => ({ ...current, weight: event.target.value }))} step="0.01" type="number" value={draft.weight} />
        </label>
      </div>
      <ManagementNotice error={error} saving={saving} />
      <div className="form-actions"><button className="button button-primary" disabled={saving} type="submit">Adicionar avaliação</button></div>
    </form>
  )
}

function GradeForm({ assessments, enrollments, onRecord }: {
  assessments: AcademicManagementPanelProps['assessments']
  enrollments: AcademicManagementPanelProps['enrollments']
  onRecord: NonNullable<AcademicManagementPanelProps['onRecordGrade']>
}) {
  const [draft, setDraft] = useState<GradeDraft>(emptyGradeDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedAssessment = assessments.find((assessment) => assessment.id === draft.assessmentId)
  const availableStudents = selectedAssessment
    ? enrollments.filter((enrollment) => enrollment.active && enrollment.diaryId === selectedAssessment.subjectId)
    : []

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const grade = optionalNonNegativeNumber(draft.grade, 'A nota')
      if (grade === null) throw new Error('A nota é obrigatória.')
      if (selectedAssessment?.maximumGrade !== null && selectedAssessment?.maximumGrade !== undefined && grade > selectedAssessment.maximumGrade) {
        throw new Error(`A nota não pode ser maior que ${selectedAssessment.maximumGrade}.`)
      }
      const input: AcademicGradeInput = {
        assessmentId: draft.assessmentId,
        studentMatricula: draft.studentMatricula,
        grade,
        feedback: asNullableText(draft.feedback),
      }
      await onRecord(input)
      setDraft(emptyGradeDraft)
    } catch (submitError) {
      setError(requestErrorMessage(submitError))
    } finally {
      setSaving(false)
    }
  }

  if (assessments.length === 0 || !enrollments.some((enrollment) => enrollment.active)) {
    return <div className="academic-management-unavailable">Cadastre uma avaliação e mantenha ao menos um aluno ativo no diário para lançar notas.</div>
  }

  return (
    <form className="academic-management-form" onSubmit={(event) => void submit(event)}>
      <div className="academic-form-heading"><div><h3>Lançar ou corrigir nota</h3><p>A nota é atualizada no mesmo registro e validada contra o máximo da avaliação.</p></div></div>
      <div className="academic-form-grid">
        <label className="academic-field-wide">Avaliação
          <select onChange={(event) => setDraft((current) => ({ ...current, assessmentId: event.target.value, studentMatricula: '' }))} required value={draft.assessmentId}>
            <option value="">Selecione uma avaliação</option>
            {assessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.subjectName} — {assessment.title}</option>)}
          </select>
        </label>
        <label>Aluno
          <select disabled={!selectedAssessment || availableStudents.length === 0} onChange={(event) => setDraft((current) => ({ ...current, studentMatricula: event.target.value }))} required value={draft.studentMatricula}>
            <option value="">Selecione um aluno</option>
            {availableStudents.map((student) => <option key={student.matricula} value={student.matricula}>{student.name} ({student.matricula})</option>)}
          </select>
        </label>
        <label>Nota{selectedAssessment?.maximumGrade ? ` (máximo ${selectedAssessment.maximumGrade})` : ''}
          <input inputMode="decimal" max={selectedAssessment?.maximumGrade ?? undefined} min="0" onChange={(event) => setDraft((current) => ({ ...current, grade: event.target.value }))} required step="0.01" type="number" value={draft.grade} />
        </label>
        <label className="academic-field-wide">Observação (opcional)
          <textarea onChange={(event) => setDraft((current) => ({ ...current, feedback: event.target.value }))} value={draft.feedback} />
        </label>
      </div>
      <ManagementNotice error={error} saving={saving} />
      <div className="form-actions"><button className="button button-primary" disabled={saving} type="submit">Salvar nota</button></div>
    </form>
  )
}

function EnrollmentForm({ enrollments, onEnroll, subjects }: {
  enrollments: AcademicManagementPanelProps['enrollments']
  onEnroll: NonNullable<AcademicManagementPanelProps['onEnrollStudents']>
  subjects: AcademicManagementPanelProps['subjects']
}) {
  const [draft, setDraft] = useState<EnrollmentDraft>(emptyEnrollmentDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedSubject = subjects.find((subject) => subject.id === draft.subjectId)
  const activeEnrollments = selectedSubject
    ? enrollments.filter((enrollment) => enrollment.diaryId === selectedSubject.id && enrollment.active)
    : []

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const input: AcademicEnrollmentInput = {
        subjectId: draft.subjectId,
        matriculas: parseMatriculas(draft.matriculas),
      }
      await onEnroll(input)
      setDraft((current) => ({ ...current, matriculas: '' }))
    } catch (submitError) {
      setError(requestErrorMessage(submitError))
    } finally {
      setSaving(false)
    }
  }

  if (subjects.length === 0) {
    return <div className="academic-management-unavailable">Crie ou selecione um diário autorizado antes de matricular alunos.</div>
  }

  return (
    <form className="academic-management-form" onSubmit={(event) => void submit(event)}>
      <div className="academic-form-heading"><div><h3>Matricular alunos no diário</h3><p>As matrículas são validadas pelo curso e pela turma do diário no servidor.</p></div></div>
      <div className="academic-form-grid">
        <SubjectSelect id="academic-enrollment-subject" label="Diário" onChange={(subjectId) => setDraft((current) => ({ ...current, subjectId }))} placeholder="Selecione um diário" subjects={subjects} value={draft.subjectId} />
        <label className="academic-field-wide">Matrículas
          <textarea onChange={(event) => setDraft((current) => ({ ...current, matriculas: event.target.value }))} placeholder="Uma por linha, vírgula ou ponto e vírgula" required value={draft.matriculas} />
        </label>
      </div>
      {selectedSubject && <p className="muted academic-enrollment-summary">{activeEnrollments.length} aluno(s) ativo(s) neste diário antes deste lançamento.</p>}
      <ManagementNotice error={error} saving={saving} />
      <div className="form-actions"><button className="button button-primary" disabled={saving} type="submit">Matricular alunos</button></div>
    </form>
  )
}

/**
 * Exibe somente as operações permitidas pela página que o contém. Isso facilita
 * o uso, mas não substitui autorização: antes de executar cada ação, o servidor
 * confere novamente a pessoa autenticada e suas permissões.
 */
export function AcademicManagementPanel(props: AcademicManagementPanelProps) {
  const [selectedForm, setSelectedForm] = useState<ManagementFormId | null>(null)

  const options = useMemo(() => {
    const available: ManagementOption[] = []
    if (props.onCreateCalendarEvent) available.push({ id: 'calendario', label: 'Calendário' })
    if (props.onCreateClassSession) available.push({ id: 'aula', label: 'Aula no diário' })
    if (props.onRecordAttendance) available.push({ id: 'frequencia', label: 'Frequência' })
    if (props.onCreateAssessment) available.push({ id: 'avaliacao', label: 'Avaliação' })
    if (props.onRecordGrade) available.push({ id: 'nota', label: 'Notas' })
    if (props.onEnrollStudents) available.push({ id: 'matriculas', label: 'Matrículas' })
    return available
  }, [props.onCreateAssessment, props.onCreateCalendarEvent, props.onCreateClassSession, props.onEnrollStudents, props.onRecordAttendance, props.onRecordGrade])

  const activeForm = options.some((option) => option.id === selectedForm) ? selectedForm : options[0]?.id

  if (!activeForm) return null

  return (
    <section aria-labelledby="academic-management-heading" className="card academic-management-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Gestão acadêmica</p>
          <h2 id="academic-management-heading">Registrar informações do período</h2>
          <p className="muted">Os lançamentos serão associados a {props.period.label} e enviados para validação do servidor.</p>
        </div>
      </div>
      <div aria-label="Tipo de lançamento" className="academic-management-tabs" role="tablist">
        {options.map((option) => (
          <button
            aria-selected={activeForm === option.id}
            className={activeForm === option.id ? 'academic-management-tab active' : 'academic-management-tab'}
            key={option.id}
            onClick={() => setSelectedForm(option.id)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="academic-management-content" role="tabpanel">
        {activeForm === 'calendario' && props.onCreateCalendarEvent && <CalendarEventForm onCreate={props.onCreateCalendarEvent} subjects={props.subjects} />}
        {activeForm === 'aula' && props.onCreateClassSession && <ClassSessionForm onCreate={props.onCreateClassSession} subjects={props.subjects} />}
        {activeForm === 'frequencia' && props.onRecordAttendance && <AttendanceForm classSessions={props.classSessions} enrollments={props.enrollments} onRecord={props.onRecordAttendance} />}
        {activeForm === 'avaliacao' && props.onCreateAssessment && <AssessmentForm onCreate={props.onCreateAssessment} subjects={props.subjects} />}
        {activeForm === 'nota' && props.onRecordGrade && <GradeForm assessments={props.assessments} enrollments={props.enrollments} onRecord={props.onRecordGrade} />}
        {activeForm === 'matriculas' && props.onEnrollStudents && <EnrollmentForm enrollments={props.enrollments} onEnroll={props.onEnrollStudents} subjects={props.subjects} />}
      </div>
    </section>
  )
}

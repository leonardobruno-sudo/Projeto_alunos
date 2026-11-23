/** Papel de `AcademicRecordMaintenance`: agrupa uma funcionalidade do produto e integra sua apresentação com os tipos e serviços que a alimentam.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

import { useState, type FormEvent } from 'react'
import type {
  AcademicAssessmentApi,
  AcademicCalendarApi,
  AcademicCalendarEventApi,
  AcademicDocumentApi,
  AcademicLessonApi,
  AcademicRequestApi,
  UpdateAcademicAssessmentPayload,
  UpdateAcademicCalendarEventPayload,
  UpdateAcademicCalendarPayload,
  UpdateAcademicDocumentPayload,
  UpdateAcademicLessonPayload,
  UpdateAcademicRequestPayload,
} from './academicApiTypes'
import './AcademicLifePage.css'

type FieldValue = string | number | boolean | null
type FieldValues = Record<string, FieldValue>
type FieldKind = 'text' | 'textarea' | 'date' | 'number' | 'checkbox' | 'select'

interface RecordField {
  key: string
  label: string
  kind: FieldKind
  required?: boolean
  min?: number
  max?: number
  step?: string
  options?: Array<{ value: string; label: string }>
}

interface EditableRecord {
  id: number
  title: string
  context: string
  updatedAt: string
  values: FieldValues
}

interface RecordGroupProps {
  title: string
  fields: RecordField[]
  records: EditableRecord[]
  onUpdate?: (id: number, values: FieldValues) => Promise<void>
  onArchive?: (id: number) => Promise<void>
  archiveLabel?: string
  archiveConfirmation?: string
}

interface AcademicRecordMaintenanceProps {
  calendars: AcademicCalendarApi[]
  calendarEvents: AcademicCalendarEventApi[]
  classSessions: AcademicLessonApi[]
  assessments: AcademicAssessmentApi[]
  documents: AcademicDocumentApi[]
  requests: AcademicRequestApi[]
  onUpdateCalendar?: (id: number, payload: UpdateAcademicCalendarPayload) => Promise<void>
  onDeleteCalendar?: (id: number) => Promise<void>
  onUpdateEvent?: (id: number, payload: UpdateAcademicCalendarEventPayload) => Promise<void>
  onDeleteEvent?: (id: number) => Promise<void>
  onUpdateLesson?: (id: number, payload: UpdateAcademicLessonPayload) => Promise<void>
  onDeleteLesson?: (id: number) => Promise<void>
  onUpdateAssessment?: (id: number, payload: UpdateAcademicAssessmentPayload) => Promise<void>
  onDeleteAssessment?: (id: number) => Promise<void>
  onUpdateRequest?: (id: number, payload: UpdateAcademicRequestPayload) => Promise<void>
  onDeleteRequest?: (id: number) => Promise<void>
  onUpdateDocument?: (id: number, payload: UpdateAcademicDocumentPayload) => Promise<void>
  onArchiveDocument?: (id: number) => Promise<void>
}

const calendarFields: RecordField[] = [
  { key: 'titulo', label: 'Título', kind: 'text', required: true },
  { key: 'turma', label: 'Turma', kind: 'text' },
  { key: 'periodo', label: 'Período (0 a 5)', kind: 'number', required: true, min: 0, max: 5, step: '1' },
  { key: 'inicioEm', label: 'Início', kind: 'date', required: true },
  { key: 'fimEm', label: 'Término', kind: 'date', required: true },
  { key: 'ativo', label: 'Calendário ativo', kind: 'checkbox' },
]

const eventFields: RecordField[] = [
  { key: 'titulo', label: 'Título', kind: 'text', required: true },
  { key: 'tipo', label: 'Tipo', kind: 'select', required: true, options: [
    { value: 'Academico', label: 'Acadêmico' },
    { value: 'Avaliacao', label: 'Avaliação' },
    { value: 'Reuniao', label: 'Reunião' },
    { value: 'Prazo', label: 'Prazo' },
    { value: 'Outro', label: 'Outro' },
  ] },
  { key: 'inicioEm', label: 'Início', kind: 'date', required: true },
  { key: 'fimEm', label: 'Término', kind: 'date', required: true },
  { key: 'descricao', label: 'Descrição', kind: 'textarea' },
  { key: 'visivelParaAlunos', label: 'Visível para alunos', kind: 'checkbox' },
]

const lessonFields: RecordField[] = [
  { key: 'dataAula', label: 'Data da aula', kind: 'date', required: true },
  { key: 'titulo', label: 'Título', kind: 'text', required: true },
  { key: 'cargaHoraria', label: 'Carga horária', kind: 'number', required: true, min: 0.1, max: 24, step: '0.1' },
  { key: 'conteudo', label: 'Conteúdo', kind: 'textarea' },
]

const assessmentFields: RecordField[] = [
  { key: 'titulo', label: 'Título', kind: 'text', required: true },
  { key: 'dataAvaliacao', label: 'Data', kind: 'date', required: true },
  { key: 'notaMaxima', label: 'Nota máxima', kind: 'number', required: true, min: 0.01, max: 1000, step: '0.01' },
  { key: 'peso', label: 'Peso', kind: 'number', required: true, min: 0.01, max: 100, step: '0.01' },
  { key: 'descricao', label: 'Descrição', kind: 'textarea' },
]

const requestFields: RecordField[] = [
  { key: 'status', label: 'Status', kind: 'select', required: true, options: [
    { value: 'ABERTO', label: 'Aberto' },
    { value: 'EM_ANALISE', label: 'Em análise' },
    { value: 'CONCLUIDO', label: 'Concluído' },
    { value: 'INDEFERIDO', label: 'Indeferido' },
  ] },
  { key: 'descricao', label: 'Descrição', kind: 'textarea' },
]

const documentFields: RecordField[] = [
  { key: 'tipo', label: 'Tipo', kind: 'text', required: true },
  { key: 'titulo', label: 'Título', kind: 'text', required: true },
  { key: 'periodo', label: 'Período (opcional)', kind: 'number', min: 0, max: 5, step: '1' },
  { key: 'referenciaExterna', label: 'Referência externa', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'select', required: true, options: [
    { value: 'DISPONIVEL', label: 'Disponível' },
    { value: 'ARQUIVADO', label: 'Arquivado' },
  ] },
  { key: 'descricao', label: 'Descrição', kind: 'textarea' },
]

function dateFieldValue(value: string): string {
  return value.slice(0, 10)
}

function makeRecord(id: number, title: string, context: string, updatedAt: string, values: FieldValues): EditableRecord {
  return { id, title, context, updatedAt, values }
}

function RecordEditor({ record, fields, onUpdate, onArchive, archiveLabel, archiveConfirmation }: RecordGroupProps & { record: EditableRecord }) {
  const [values, setValues] = useState<FieldValues>(() => ({ ...record.values }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setValue(key: string, value: FieldValue) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!onUpdate) return
    setSaving(true)
    setError('')
    try {
      await onUpdate(record.id, values)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar este registro.')
    } finally {
      setSaving(false)
    }
  }

  async function archive() {
    if (!onArchive || !window.confirm(archiveConfirmation || 'Confirma esta ação?')) return
    setSaving(true)
    setError('')
    try {
      await onArchive(record.id)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível concluir esta ação.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="academic-record-editor">
      <summary>
        <span><strong>{record.title}</strong><small>{record.context}</small></span>
        <span className="academic-record-updated">Atualizado: {record.updatedAt.slice(0, 10)}</span>
      </summary>
      <form className="academic-management-form" onSubmit={(event) => void submit(event)}>
        <div className="academic-form-grid">
          {fields.map((field) => {
            const value = values[field.key]
            if (field.kind === 'checkbox') {
              return (
                <label className="academic-checkbox-field" key={field.key}>
                  <input checked={value === true} onChange={(event) => setValue(field.key, event.target.checked)} type="checkbox" />
                  {field.label}
                </label>
              )
            }
            if (field.kind === 'select') {
              return (
                <label key={field.key}>
                  {field.label}
                  <select onChange={(event) => setValue(field.key, event.target.value)} required={field.required} value={String(value ?? '')}>
                    {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              )
            }
            if (field.kind === 'textarea') {
              return (
                <label className="academic-field-wide" key={field.key}>
                  {field.label}
                  <textarea onChange={(event) => setValue(field.key, event.target.value)} required={field.required} value={String(value ?? '')} />
                </label>
              )
            }
            return (
              <label key={field.key}>
                {field.label}
                <input
                  max={field.max}
                  min={field.min}
                  onChange={(event) => setValue(field.key, field.kind === 'number'
                    ? event.target.value === '' ? null : Number(event.target.value)
                    : event.target.value)}
                  required={field.required}
                  step={field.step}
                  type={field.kind}
                  value={field.kind === 'date' ? dateFieldValue(String(value ?? '')) : String(value ?? '')}
                />
              </label>
            )
          })}
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="form-actions">
          {onUpdate && <button className="button button-primary" disabled={saving} type="submit">{saving ? 'Salvando…' : 'Salvar alterações'}</button>}
          {onArchive && <button className="button button-danger" disabled={saving} onClick={() => void archive()} type="button">{archiveLabel || 'Excluir'}</button>}
        </div>
      </form>
    </details>
  )
}

function RecordGroup(props: RecordGroupProps) {
  if (props.records.length === 0) return null
  return (
    <section className="academic-record-group">
      <h3>{props.title} <span>({props.records.length})</span></h3>
      <div className="academic-record-list">
        {props.records.map((record) => (
          <RecordEditor key={`${record.id}:${record.updatedAt}`} {...props} record={record} />
        ))}
      </div>
    </section>
  )
}

export function AcademicRecordMaintenancePanel({
  calendars,
  calendarEvents,
  classSessions,
  assessments,
  documents,
  requests,
  onUpdateCalendar,
  onDeleteCalendar,
  onUpdateEvent,
  onDeleteEvent,
  onUpdateLesson,
  onDeleteLesson,
  onUpdateAssessment,
  onDeleteAssessment,
  onUpdateRequest,
  onDeleteRequest,
  onUpdateDocument,
  onArchiveDocument,
}: AcademicRecordMaintenanceProps) {
  const groups = [
    {
      title: 'Calendários', fields: calendarFields,
      records: calendars.map((item) => makeRecord(item.id, item.titulo, `${item.curso} · ${item.turma || 'Todas as turmas'}`, item.atualizadoEm, {
        titulo: item.titulo, turma: item.turma, periodo: item.periodo, inicioEm: item.inicioEm, fimEm: item.fimEm, ativo: item.ativo,
      })),
      onUpdate: onUpdateCalendar ? async (id: number, values: FieldValues) => onUpdateCalendar(id, {
        titulo: String(values.titulo ?? ''), turma: String(values.turma ?? ''), periodo: Number(values.periodo),
        inicioEm: String(values.inicioEm ?? ''), fimEm: String(values.fimEm ?? ''), ativo: values.ativo === true,
      }) : undefined,
      onArchive: onDeleteCalendar,
      archiveLabel: 'Excluir calendário',
      archiveConfirmation: 'Excluir este calendário também remove os eventos vinculados. Deseja continuar?',
    },
    {
      title: 'Eventos', fields: eventFields,
      records: calendarEvents.map((item) => makeRecord(item.id, item.titulo, `${item.tipo} · ${item.inicioEm}`, item.atualizadoEm, {
        titulo: item.titulo, tipo: item.tipo, inicioEm: item.inicioEm, fimEm: item.fimEm,
        descricao: item.descricao, visivelParaAlunos: item.visivelParaAlunos,
      })),
      onUpdate: onUpdateEvent ? async (id: number, values: FieldValues) => onUpdateEvent(id, {
        titulo: String(values.titulo ?? ''), tipo: String(values.tipo ?? 'Outro') as UpdateAcademicCalendarEventPayload['tipo'],
        inicioEm: String(values.inicioEm ?? ''), fimEm: String(values.fimEm ?? ''),
        descricao: String(values.descricao ?? ''), visivelParaAlunos: values.visivelParaAlunos === true,
      }) : undefined,
      onArchive: onDeleteEvent,
      archiveLabel: 'Excluir evento',
      archiveConfirmation: 'Confirma excluir este evento do calendário?',
    },
    {
      title: 'Aulas', fields: lessonFields,
      records: classSessions.map((item) => makeRecord(item.id, item.titulo, item.dataAula, item.atualizadoEm, {
        dataAula: item.dataAula, titulo: item.titulo, conteudo: item.conteudo, cargaHoraria: item.cargaHoraria,
      })),
      onUpdate: onUpdateLesson ? async (id: number, values: FieldValues) => onUpdateLesson(id, {
        dataAula: String(values.dataAula ?? ''), titulo: String(values.titulo ?? ''),
        conteudo: String(values.conteudo ?? ''), cargaHoraria: Number(values.cargaHoraria),
      }) : undefined,
      onArchive: onDeleteLesson,
      archiveLabel: 'Excluir aula',
      archiveConfirmation: 'Excluir esta aula também remove as frequências lançadas para ela. Deseja continuar?',
    },
    {
      title: 'Avaliações', fields: assessmentFields,
      records: assessments.map((item) => makeRecord(item.id, item.titulo, item.dataAvaliacao, item.atualizadoEm, {
        titulo: item.titulo, descricao: item.descricao, dataAvaliacao: item.dataAvaliacao,
        peso: item.peso, notaMaxima: item.notaMaxima,
      })),
      onUpdate: onUpdateAssessment ? async (id: number, values: FieldValues) => onUpdateAssessment(id, {
        titulo: String(values.titulo ?? ''), descricao: String(values.descricao ?? ''),
        dataAvaliacao: String(values.dataAvaliacao ?? ''), peso: Number(values.peso), notaMaxima: Number(values.notaMaxima),
      }) : undefined,
      onArchive: onDeleteAssessment,
      archiveLabel: 'Excluir avaliação',
      archiveConfirmation: 'Excluir esta avaliação também remove as notas lançadas para ela. Deseja continuar?',
    },
    {
      title: 'Requerimentos', fields: requestFields,
      records: requests.map((item) => makeRecord(item.id, item.tipo, `${item.matricula} · ${item.status}`, item.atualizadoEm, {
        status: item.status, descricao: item.descricao,
      })),
      onUpdate: onUpdateRequest ? async (id: number, values: FieldValues) => onUpdateRequest(id, {
        status: String(values.status ?? 'ABERTO') as UpdateAcademicRequestPayload['status'],
        descricao: String(values.descricao ?? ''),
      }) : undefined,
      onArchive: onDeleteRequest,
      archiveLabel: 'Excluir requerimento',
      archiveConfirmation: 'Confirma excluir este requerimento acadêmico?',
    },
    {
      title: 'Documentos', fields: documentFields,
      records: documents.map((item) => makeRecord(item.id, item.titulo, `${item.matricula} · ${item.status}`, item.atualizadoEm, {
        tipo: item.tipo, titulo: item.titulo, descricao: item.descricao,
        periodo: item.periodo, referenciaExterna: item.referenciaExterna, status: item.status,
      })),
      onUpdate: onUpdateDocument ? async (id: number, values: FieldValues) => onUpdateDocument(id, {
        tipo: String(values.tipo ?? ''), titulo: String(values.titulo ?? ''), descricao: String(values.descricao ?? ''),
        periodo: values.periodo === null ? null : Number(values.periodo),
        referenciaExterna: String(values.referenciaExterna ?? ''),
        status: String(values.status ?? 'DISPONIVEL') as UpdateAcademicDocumentPayload['status'],
      }) : undefined,
      onArchive: onArchiveDocument,
      archiveLabel: 'Arquivar documento',
      archiveConfirmation: 'O documento deixará de aparecer como disponível para o aluno. Deseja arquivar?',
    },
  ]

  const visibleGroups = groups.filter((group) => group.records.length > 0 && (group.onUpdate || group.onArchive))
  if (visibleGroups.length === 0) return null

  return (
    <section aria-labelledby="academic-record-maintenance-heading" className="card academic-record-maintenance">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Manutenção</p>
          <h2 id="academic-record-maintenance-heading">Corrigir ou arquivar registros</h2>
          <p className="muted">As alterações respeitam o escopo do seu perfil; registros vinculados podem ser removidos junto com o item principal.</p>
        </div>
      </div>
      {visibleGroups.map((group) => <RecordGroup key={group.title} {...group} />)}
    </section>
  )
}
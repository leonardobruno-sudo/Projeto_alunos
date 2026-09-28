/** Responsabilidade: centraliza a criação e edição dos dados acadêmicos de um aluno. */

import { useState, type FormEvent } from 'react'
import { QUOTA_OPTIONS } from '../constants/quotas'
import type { Student, StudentPayload } from '../types'
import { getErrorMessage } from '../utils/api'
import { getStudentSubjects } from '../utils/students'
import { newSubjectDraft, subjectDraftsFrom, subjectsFromDrafts, type SubjectDraft } from '../utils/subjectDrafts'
import { SubjectInputs } from './SubjectInputs'

interface StudentFormProps {
  mode: 'create' | 'edit'
  initialStudent?: Student
  submitLabel: string
  onSubmit: (payload: StudentPayload) => Promise<string | void>
  onCancel?: () => void
  onLoadTurmaSubjects?: (turma: string) => Promise<string[]>
}

interface FormState {
  matricula: string
  nome: string
  telefone: string
  curso: string
  disciplina: string
  categoria: string
  turma: string
  descricao: string
  tipoCota: string
}

function buildState(student?: Student): FormState {
  return {
    matricula: student?.matricula ?? '',
    nome: student?.nome ?? '',
    telefone: student?.telefone ?? '',
    curso: student?.curso ?? '',
    disciplina: student?.disciplina ?? '',
    categoria: student?.categoria ?? 'Integrado',
    turma: student?.turma ?? '',
    descricao: student?.descricao ?? '',
    tipoCota: student?.cota_detalhada ?? 'AC',
  }
}

function initialSubjects(student?: Student): SubjectDraft[] {
  const subjects = student ? getStudentSubjects(student) : []
  return subjects.length > 0 ? subjectDraftsFrom(subjects) : [newSubjectDraft()]
}

export function StudentForm({
  mode,
  initialStudent,
  submitLabel,
  onSubmit,
  onCancel,
  onLoadTurmaSubjects,
}: StudentFormProps) {
  const [form, setForm] = useState<FormState>(() => buildState(initialStudent))
  const [subjects, setSubjects] = useState<SubjectDraft[]>(() => initialSubjects(initialStudent))
  const [error, setError] = useState('')
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [saving, setSaving] = useState(false)

  const isEdit = mode === 'edit'

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function loadTurmaSubjects() {
    if (!onLoadTurmaSubjects || !form.turma.trim()) return

    setError('')
    setLoadingSubjects(true)
    try {
      const names = await onLoadTurmaSubjects(form.turma.trim())
      if (names.length > 0) setSubjects(names.map((name) => newSubjectDraft(name)))
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoadingSubjects(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!form.matricula.trim() || !form.nome.trim() || !form.turma.trim()) {
      setError('Matrícula, nome e turma são obrigatórios.')
      return
    }

    const payload: StudentPayload = {
      matricula: form.matricula.trim(),
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      curso: form.curso.trim(),
      disciplina: form.disciplina.trim(),
      categoria: form.categoria,
      turma: form.turma.trim(),
      descricao: form.descricao.trim(),
      tipo_cota: form.tipoCota,
      cotista: form.tipoCota === 'AC' ? 'Não' : 'Sim',
      cota_detalhada: form.tipoCota,
      subjects: subjectsFromDrafts(subjects),
    }

    setSaving(true)
    try {
      await onSubmit(payload)
      if (!isEdit) {
        setForm(buildState())
        setSubjects([newSubjectDraft()])
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="stack-form student-form" onSubmit={submit}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="form-grid">
        <label>
          Matrícula
          <input
            disabled={isEdit}
            onChange={(event) => updateField('matricula', event.target.value)}
            required
            value={form.matricula}
          />
        </label>
        <label>
          Nome completo
          <input onChange={(event) => updateField('nome', event.target.value)} required value={form.nome} />
        </label>
        <label>
          Telefone
          <input onChange={(event) => updateField('telefone', event.target.value)} value={form.telefone} />
        </label>
        <label>
          Curso
          <input onChange={(event) => updateField('curso', event.target.value)} value={form.curso} />
        </label>
        <label>
          Disciplina
          <input onChange={(event) => updateField('disciplina', event.target.value)} value={form.disciplina} />
        </label>
        <label>
          Turma
          <input onChange={(event) => updateField('turma', event.target.value)} required value={form.turma} />
        </label>
        <label>
          Categoria
          <select onChange={(event) => updateField('categoria', event.target.value)} value={form.categoria}>
            <option value="Integrado">Integrado</option>
            <option value="Subsequente">Subsequente</option>
            <option value="Superior">Superior</option>
            <option value="Proeja">Proeja</option>
          </select>
        </label>
        <label>
          Modalidade de cota
          <select onChange={(event) => updateField('tipoCota', event.target.value)} value={form.tipoCota}>
            {QUOTA_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="field-wide">
          Observações
          <textarea onChange={(event) => updateField('descricao', event.target.value)} rows={3} value={form.descricao} />
        </label>
      </div>

      {onLoadTurmaSubjects && (
        <div className="inline-action">
          <span className="muted">Já existe uma turma cadastrada?</span>
          <button className="button button-secondary" disabled={loadingSubjects || !form.turma.trim()} onClick={loadTurmaSubjects} type="button">
            {loadingSubjects ? 'Carregando...' : 'Usar matérias da turma'}
          </button>
        </div>
      )}

      <SubjectInputs onChange={setSubjects} subjects={subjects} />

      <div className="form-actions">
        {onCancel && <button className="button button-secondary" onClick={onCancel} type="button">Cancelar</button>}
        <button className="button button-primary" disabled={saving} type="submit">
          {saving ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  )
}

/** Responsabilidade: converte matérias entre rascunhos de formulário e dados da API. */

import type { Subject } from '../types'

export interface SubjectDraft {
  id: string
  name: string
  nota: string
  faltas: string
  faltasJustificadas: string
  totalAulas: string
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function newSubjectDraft(name = ''): SubjectDraft {
  return {
    id: createId(),
    name,
    nota: '',
    faltas: '',
    faltasJustificadas: '',
    totalAulas: '',
  }
}

export function subjectDraftsFrom(subjects: Subject[]): SubjectDraft[] {
  return subjects.map((subject) => ({
    id: createId(),
    name: subject.name,
    nota: String(subject.nota ?? ''),
    faltas: String(subject.faltas ?? ''),
    faltasJustificadas: String(subject.faltas_justificadas ?? subject.justificadas ?? ''),
    totalAulas: String(subject.total_aulas ?? ''),
  }))
}

function numberOrZero(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function draftNumber(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return 0
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/** Validates the relationships that must hold before the academic payload is sent. */
export function validateSubjectDrafts(drafts: SubjectDraft[]): string | null {
  for (const draft of drafts) {
    const hasValues = [draft.nota, draft.faltas, draft.faltasJustificadas, draft.totalAulas]
      .some((value) => value.trim() !== '')
    const name = draft.name.trim()
    if (!name) {
      if (hasValues) return 'Informe o nome da matéria antes de preencher notas ou faltas.'
      continue
    }

    const grade = draftNumber(draft.nota)
    const absences = draftNumber(draft.faltas)
    const justified = draftNumber(draft.faltasJustificadas)
    const totalClasses = draftNumber(draft.totalAulas)
    if (grade === null || absences === null || justified === null || totalClasses === null) {
      return `Use números válidos na matéria ${name}.`
    }
    if (grade < 0 || grade > 100) return `A nota de ${name} deve estar entre 0 e 100.`
    if (![absences, justified, totalClasses].every(Number.isInteger) || absences < 0 || justified < 0 || totalClasses < 0) {
      return `Faltas, justificadas e total de aulas de ${name} devem ser números inteiros não negativos.`
    }
    if (absences > totalClasses) return `As faltas de ${name} não podem ser maiores que o total de aulas.`
    if (justified > Math.min(absences, totalClasses)) {
      return `As faltas justificadas de ${name} não podem ser maiores que as faltas nem que o total de aulas.`
    }
  }

  return null
}

export function subjectsFromDrafts(drafts: SubjectDraft[]): Subject[] {
  return drafts
    .map((draft) => ({
      name: draft.name.trim(),
      nota: numberOrZero(draft.nota),
      faltas: numberOrZero(draft.faltas),
      faltas_justificadas: numberOrZero(draft.faltasJustificadas),
      total_aulas: numberOrZero(draft.totalAulas),
    }))
    .filter((subject) => subject.name)
}

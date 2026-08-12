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

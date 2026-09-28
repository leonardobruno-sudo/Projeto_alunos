/** Responsabilidade: edita dinamicamente as matérias e indicadores de cada aluno. */

import type { SubjectDraft } from '../utils/subjectDrafts'
import { newSubjectDraft } from '../utils/subjectDrafts'

interface SubjectInputsProps {
  subjects: SubjectDraft[]
  onChange: (subjects: SubjectDraft[]) => void
}

export function SubjectInputs({ subjects, onChange }: SubjectInputsProps) {
  function updateSubject(id: string, field: keyof Omit<SubjectDraft, 'id'>, value: string) {
    onChange(subjects.map((subject) => (subject.id === id ? { ...subject, [field]: value } : subject)))
  }

  function removeSubject(id: string) {
    onChange(subjects.filter((subject) => subject.id !== id))
  }

  return (
    <div className="subject-editor">
      <div className="section-heading compact">
        <div>
          <h3>Matérias e avaliações</h3>
          <p className="muted">Adicione notas, faltas e número de aulas por matéria.</p>
        </div>
        <button className="button button-secondary" onClick={() => onChange([...subjects, newSubjectDraft()])} type="button">
          Adicionar matéria
        </button>
      </div>

      {subjects.length === 0 ? (
        <p className="empty-inline">Nenhuma matéria adicionada.</p>
      ) : (
        <div className="subject-input-list">
          {subjects.map((subject, index) => (
            <div className="subject-input-card" key={subject.id}>
              <div className="subject-card-heading">
                <strong>Matéria {index + 1}</strong>
                <button className="text-button danger-text" onClick={() => removeSubject(subject.id)} type="button">
                  Remover
                </button>
              </div>
              <div className="form-grid subject-fields">
                <label className="field-wide">
                  Nome da matéria
                  <input
                    onChange={(event) => updateSubject(subject.id, 'name', event.target.value)}
                    placeholder="Ex.: Matemática"
                    value={subject.name}
                  />
                </label>
                <label>
                  Nota
                  <input max="100" min="0" onChange={(event) => updateSubject(subject.id, 'nota', event.target.value)} step="0.01" type="number" value={subject.nota} />
                </label>
                <label>
                  Faltas
                  <input min="0" onChange={(event) => updateSubject(subject.id, 'faltas', event.target.value)} step="1" type="number" value={subject.faltas} />
                </label>
                <label>
                  Justificadas
                  <input max={subject.faltas || undefined} min="0" onChange={(event) => updateSubject(subject.id, 'faltasJustificadas', event.target.value)} step="1" type="number" value={subject.faltasJustificadas} />
                </label>
                <label>
                  Total de aulas
                  <input min="0" onChange={(event) => updateSubject(subject.id, 'totalAulas', event.target.value)} step="1" type="number" value={subject.totalAulas} />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

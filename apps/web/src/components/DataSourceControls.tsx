/** Controls and explains whether academic data comes from the live record or a saved period. */

import type { AcademicDataSource } from '../types'

interface DataSourceSelectorProps {
  id: string
  value: AcademicDataSource
  onChange: (value: AcademicDataSource) => void
}

interface DataSourceNoticeProps {
  source: AcademicDataSource
  hasPeriodSnapshot: boolean
  snapshotAt?: string | null
  periodName?: string
  readOnly?: boolean
}

function snapshotDescription(snapshotAt?: string | null): string {
  const rawValue = String(snapshotAt ?? '').trim()
  if (!rawValue) return ''

  const timestamp = new Date(rawValue)
  if (Number.isNaN(timestamp.getTime())) return ` Fechamento registrado em ${rawValue}.`

  return ` Fechamento registrado em ${timestamp.toLocaleString('pt-BR')}.`
}

export function DataSourceSelector({ id, value, onChange }: DataSourceSelectorProps) {
  return (
    <label className="data-source-control" htmlFor={id}>
      Fonte dos dados
      <select id={id} onChange={(event) => onChange(event.target.value === 'historico' ? 'historico' : 'atual')} value={value}>
        <option value="atual">Dados atuais</option>
        <option value="historico">Histórico do período</option>
      </select>
    </label>
  )
}

export function DataSourceNotice({
  source,
  hasPeriodSnapshot,
  snapshotAt,
  periodName,
  readOnly = source === 'historico',
}: DataSourceNoticeProps) {
  const period = periodName ? ` de ${periodName}` : ''

  if (source === 'historico') {
    return (
      <div className="alert alert-info data-source-notice" role="status">
        <strong>Histórico fechado{period}.</strong>{' '}
        Você está consultando uma cópia registrada do período.{snapshotDescription(snapshotAt)}
        {readOnly ? ' Para alterar notas, faltas ou aulas, selecione Dados atuais.' : ''}
      </div>
    )
  }

  if (hasPeriodSnapshot) {
    return (
      <div className="alert alert-info data-source-notice" role="status">
        <strong>Dados atuais{period}.</strong>{' '}
        Existe um histórico fechado para este período. Alterações feitas aqui atualizam somente o cadastro atual e não modificam o fechamento.{snapshotDescription(snapshotAt)}
      </div>
    )
  }

  return (
    <p className="data-source-status" role="status">
      <span aria-hidden="true" className="data-source-dot" />
      Exibindo dados atuais, que refletem as últimas alterações no cadastro.
    </p>
  )
}

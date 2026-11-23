/** Papel de `academicDataSource`: transforma, valida ou transporta dados entre a interface e os formatos usados pela API ou por arquivos exportados.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

/** Padroniza a origem informada pelas rotas acadêmicas atuais e históricas. */

import type { AcademicDataSource, StudentDetailData, StudentFilters, StudentListData, SubjectData } from '../types'

export interface AcademicSourceMetadata {
  source: AcademicDataSource
  hasPeriodSnapshot: boolean
  snapshotAt: string | null
  periodIndex: number
  currentPeriodName: string
  periodOptions: string[]
}

type AcademicSourceResponse = Pick<
  StudentListData | SubjectData | StudentDetailData,
  'dataSource' | 'hasPeriodSnapshot' | 'snapshotAt' | 'periodIndex' | 'currentPeriodName' | 'periodOptions'
>

export function academicSourceMetadata(
  response: AcademicSourceResponse | undefined,
  filters: Pick<StudentFilters, 'periodo' | 'fonte'>,
): AcademicSourceMetadata {
  const source = response?.dataSource === 'historico'
    ? 'historico'
    : response?.dataSource === 'atual'
      ? 'atual'
      : filters.fonte === 'historico'
        ? 'historico'
        : 'atual'
  const requestedPeriod = Number(filters.periodo)
  const periodIndex = Number.isInteger(response?.periodIndex)
    ? Number(response?.periodIndex)
    : Number.isInteger(requestedPeriod)
      ? requestedPeriod
      : 0

  return {
    source,
    hasPeriodSnapshot: response?.hasPeriodSnapshot === true,
    snapshotAt: response?.snapshotAt ?? null,
    periodIndex,
    currentPeriodName: response?.currentPeriodName ?? '',
    periodOptions: response?.periodOptions ?? [],
  }
}

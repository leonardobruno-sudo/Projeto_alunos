/** Presents scoped academic indicators with selectable charts, export and print actions. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { StatisticsChart, type ChartDatum, type StatisticsChartType } from '../components/StatisticsChart'
import { QUOTA_OPTIONS, quotaLabel } from '../constants/quotas'
import { DEFAULT_PERIODS, type StatisticsData, type StatisticsFilters, type StatisticsValue, type User } from '../types'
import { api } from '../utils/api'
import './StatisticsPage.css'

interface StatisticsPageProps {
  user: User
  onMessage: (message: string) => void
  onError: (error: unknown) => string
}

const chartOptions: Array<{ type: StatisticsChartType; label: string }> = [
  { type: 'pie', label: 'Pizza' },
  { type: 'columns', label: 'Colunas' },
  { type: 'line', label: 'Linhas' },
  { type: 'bars', label: 'Barras' },
  { type: 'area', label: 'Área' },
]

interface AdminStatisticsFilters {
  curso: string
  turma: string
  cota: string
}

const emptyAdminFilters: AdminStatisticsFilters = {
  curso: '',
  turma: '',
  cota: '',
}

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

function formatGrade(value: number): string {
  return formatNumber(value, 1)
}

function formatPercent(value: number): string {
  return `${formatNumber(value, 1)}%`
}

function chartData(values: StatisticsValue[]): ChartDatum[] {
  return values.map((item) => ({ label: item.label, value: Number(item.value) || 0 }))
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`
}

function hasAdminFilters(filters: AdminStatisticsFilters): boolean {
  return Boolean(filters.curso || filters.turma || filters.cota)
}

function adminFilterSummary(filters: StatisticsFilters): string {
  const parts = [
    filters.curso && `Curso: ${filters.curso}`,
    filters.turma && `Turma: ${filters.turma}`,
    filters.categoria && `Categoria: ${filters.categoria}`,
    filters.cota && `Categoria de cota: ${quotaLabel(filters.cota)}`,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : 'Sem filtros adicionais'
}

function dataSourcePresentation(source: StatisticsData['dataSource']) {
  if (source === 'historico') {
    return {
      badge: 'Histórico salvo',
      description: 'Todos os dados visíveis deste período foram carregados de um retrato histórico salvo.',
    }
  }
  if (source === 'misto') {
    return {
      badge: 'Histórico parcial',
      description: 'Este período combina registros históricos já salvos com dados atuais ainda sem retrato.',
    }
  }
  return {
    badge: 'Dados atuais',
    description: 'Os indicadores deste período refletem os registros atuais, ainda sem histórico visível salvo.',
  }
}

function dataSourceLabel(source: StatisticsData['dataSource']): string {
  return dataSourcePresentation(source).badge
}

function downloadCsv(data: StatisticsData) {
  const appliedFilterText = adminFilterSummary(data.filters)
  const rows: Array<Array<string | number>> = [
    ['Relatório de estatísticas acadêmicas', ''],
    ['Período', data.currentPeriodName],
    ['Escopo', data.scope.label],
    ['Origem dos dados', dataSourceLabel(data.dataSource)],
    ['Filtros administrativos', appliedFilterText],
    [],
    ['Indicador', 'Valor'],
    ['Alunos visíveis', data.totals.students],
    ['Registros de matéria', data.totals.subjectRecords],
    ['Média geral', formatGrade(data.totals.averageGrade)],
    ['Frequência média (%)', formatPercent(data.totals.averageAttendancePercent)],
    ['Em risco', data.totals.atRisk],
    ['Em alerta', data.totals.alert],
    ['Regular', data.totals.regular],
    [],
    ['Situação', 'Quantidade'],
    ...data.statusCounts.map((item) => [item.label, item.value]),
    [],
    ['Faixa de nota', 'Quantidade'],
    ...data.gradeDistribution.map((item) => [item.label, item.value]),
    [],
    ['Faixa de frequência', 'Quantidade'],
    ...data.attendanceDistribution.map((item) => [item.label, item.value]),
    [],
    ['Evolução por período', 'Histórico salvo', 'Alunos', 'Média', 'Faltas (%)', 'Em risco', 'Em alerta'],
    ...data.evolution.map((item) => item.available && item.hasVisibleRecords
      ? [item.label, 'Sim', item.students, formatGrade(item.averageGrade), formatPercent(item.averageAttendancePercent), item.atRisk, item.alert]
      : [item.label, item.available ? 'Sim - sem registros no filtro' : 'Não', 0, formatGrade(0), formatPercent(0), 0, 0]),
    [],
    ['Matéria', 'Alunos', 'Média de nota', 'Frequência média (%)', 'Em risco', 'Em alerta', 'Regular'],
    ...data.subjectAverages.map((item) => [
      item.subject,
      item.studentCount,
      formatGrade(item.averageGrade),
      formatPercent(item.averageAttendancePercent),
      item.atRisk,
      item.alert,
      item.regular,
    ]),
  ]
  const content = `\ufeff${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`
  const fileName = data.currentPeriodName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLocaleLowerCase('pt-BR')
  const link = document.createElement('a')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))

  link.href = url
  link.download = `estatisticas-${fileName || 'academicas'}.csv`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function StatisticsPage({ user, onMessage, onError }: StatisticsPageProps) {
  const [data, setData] = useState<StatisticsData | null>(null)
  const [periodIndex, setPeriodIndex] = useState(0)
  const [chartType, setChartType] = useState<StatisticsChartType>('columns')
  const [draftFilters, setDraftFilters] = useState<AdminStatisticsFilters>(emptyAdminFilters)
  const [appliedFilters, setAppliedFilters] = useState<AdminStatisticsFilters>(emptyAdminFilters)
  const [loading, setLoading] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [savingHistory, setSavingHistory] = useState(false)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)
  const isAdmin = user.role === 'Admin'

  const load = useCallback(async (requestedPeriod: number, requestedFilters: AdminStatisticsFilters) => {
    const version = ++requestVersion.current
    setLoading(true)
    setError('')

    try {
      const result = await api.getStatistics({
        periodo: requestedPeriod,
        ...(user.role === 'Admin' ? requestedFilters : {}),
      })
      if (version !== requestVersion.current) return
      setData(result.data)
      setPeriodIndex(result.data.periodIndex)
    } catch (requestError) {
      if (version === requestVersion.current) setError(onError(requestError))
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [onError, user.role])

  useEffect(() => {
    void load(0, emptyAdminFilters)
  }, [load])

  const periods = data?.periodOptions?.length ? data.periodOptions : DEFAULT_PERIODS
  const statusData = data ? chartData(data.statusCounts) : []
  const gradeData = data ? chartData(data.gradeDistribution) : []
  const attendanceData = data ? chartData(data.attendanceDistribution) : []
  const subjectData = data?.subjectAverages.map((item) => ({
    label: item.subject,
    value: Number(item.averageGrade) || 0,
  })) ?? []
  const evolution = data?.evolution ?? []
  const savedEvolution = evolution.filter((item) => item.available)
  const availableEvolution = savedEvolution.filter((item) => item.hasVisibleRecords)
  const evolutionGradeData = availableEvolution.map((item) => ({
    label: item.label,
    value: Number(item.averageGrade) || 0,
  }))
  const scopeLabel = data?.scope.label || `Dados visíveis para ${user.role}`
  const source = dataSourcePresentation(data?.dataSource ?? 'atual')
  const hasSavedHistory = data?.hasPeriodSnapshot ?? data?.history?.periodSaved ?? data?.historyAvailable ?? false

  function choosePeriod(index: number) {
    setPeriodIndex(index)
    void load(index, appliedFilters)
  }

  function updateFilter(field: keyof AdminStatisticsFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [field]: value }))
  }

  function applyAdminFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextFilters = {
      curso: draftFilters.curso.trim(),
      turma: draftFilters.turma.trim(),
      cota: draftFilters.cota.trim(),
    }
    setDraftFilters(nextFilters)
    setAppliedFilters(nextFilters)
    void load(periodIndex, nextFilters)
  }

  function clearAdminFilters() {
    setDraftFilters(emptyAdminFilters)
    setAppliedFilters(emptyAdminFilters)
    void load(periodIndex, emptyAdminFilters)
  }

  function handleDownload() {
    if (!data) return
    downloadCsv(data)
    onMessage('Relatório de estatísticas baixado em CSV.')
  }

  async function handleDownloadPdf() {
    if (!data) return

    setGeneratingPdf(true)
    try {
      const { downloadStatisticsPdf } = await import('../utils/statisticsPdf')
      downloadStatisticsPdf(data, isAdmin ? appliedFilters : {})
      onMessage('Relatório de estatísticas baixado em PDF.')
    } catch (downloadError) {
      setError(onError(downloadError))
    } finally {
      setGeneratingPdf(false)
    }
  }

  async function handleSaveHistory() {
    if (!data || !isAdmin) return

    const overwrite = hasSavedHistory
    if (overwrite) {
      const confirmed = window.confirm(
        `Já existe um histórico para ${data.currentPeriodName}. Deseja substituir o retrato salvo de todos os alunos?`,
      )
      if (!confirmed) return
    }

    setSavingHistory(true)
    setError('')
    try {
      const result = await api.saveAcademicHistory(data.periodIndex, overwrite)
      onMessage(result.message)
      await load(data.periodIndex, appliedFilters)
    } catch (saveError) {
      setError(onError(saveError))
    } finally {
      setSavingHistory(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <section className="page-stack statistics-page">
      <div className="page-header statistics-header">
        <div>
          <p className="eyebrow">Indicadores acadêmicos</p>
          <h1>Estatísticas</h1>
          <p className="muted">Os dados respeitam automaticamente o seu perfil e escopo de acesso.</p>
        </div>
        <span className="statistics-scope" title={scopeLabel}>{scopeLabel}</span>
      </div>

      <div className="period-tabs" aria-label="Selecionar período das estatísticas">
        {periods.map((period, index) => (
          <button
            aria-pressed={periodIndex === index}
            className={periodIndex === index ? 'period-tab active' : 'period-tab'}
            key={period}
            onClick={() => choosePeriod(index)}
            type="button"
          >
            {period}
          </button>
        ))}
      </div>

      {isAdmin && (
        <form className="statistics-admin-filters card" onSubmit={applyAdminFilters}>
          <div className="statistics-filter-heading">
            <div>
              <p className="eyebrow">Filtros administrativos</p>
              <h2>Refinar a visão geral</h2>
              <p className="muted">Estes filtros só estão disponíveis para Administradores e são aplicados aos gráficos, exportações e impressão.</p>
            </div>
            <span className="statistics-filter-summary">{adminFilterSummary(appliedFilters)}</span>
          </div>
          <div className="statistics-filter-fields">
            <label>
              Curso
              <input
                autoComplete="off"
                onChange={(event) => updateFilter('curso', event.target.value)}
                placeholder="Ex.: Técnico em Informática"
                value={draftFilters.curso}
              />
            </label>
            <label>
              Turma
              <input
                autoComplete="off"
                onChange={(event) => updateFilter('turma', event.target.value)}
                placeholder="Ex.: 1º Ano A"
                value={draftFilters.turma}
              />
            </label>
            <label>
              Categoria de cota
              <select onChange={(event) => updateFilter('cota', event.target.value)} value={draftFilters.cota}>
                <option value="">Todas as modalidades</option>
                {QUOTA_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <div className="statistics-filter-actions">
              <button className="button button-primary" disabled={loading} type="submit">Aplicar filtros</button>
              <button className="button button-secondary" disabled={loading || !hasAdminFilters(appliedFilters)} onClick={clearAdminFilters} type="button">Limpar</button>
            </div>
          </div>
        </form>
      )}

      <section className="statistics-source card" aria-label="Origem dos dados deste período">
        <div>
          <p className="eyebrow">Origem dos dados</p>
          <h2>{source.badge}</h2>
          <p className="muted">{source.description}</p>
          {data && (
            <p className="statistics-source-detail">
              {data.history.historicalStudents} registro(s) histórico(s) e {data.history.liveStudents} registro(s) atual(is) no recorte exibido.
            </p>
          )}
        </div>
        <div className="statistics-source-actions">
          <span className={`statistics-source-badge ${data?.dataSource ?? 'atual'}`}>{source.badge}</span>
          {isAdmin && (
            <>
              <button
                className="button button-secondary"
                disabled={!data || loading || savingHistory}
                onClick={() => void handleSaveHistory()}
                type="button"
              >
                {savingHistory
                  ? 'Salvando histórico...'
                  : hasSavedHistory ? 'Atualizar histórico deste período' : 'Salvar histórico deste período'}
              </button>
              <small>O salvamento registra todos os alunos; os filtros desta tela não limitam o retrato histórico.</small>
            </>
          )}
        </div>
      </section>

      <section className="statistics-toolbar card" aria-label="Opções de visualização">
        <div>
          <h2>Visualização dos gráficos</h2>
          <p className="muted">Escolha um dos cinco formatos para comparar os mesmos dados.</p>
          <div className="statistics-chart-picker" role="group" aria-label="Tipo de gráfico">
            {chartOptions.map((option) => (
              <button
                aria-pressed={chartType === option.type}
                className={chartType === option.type ? 'statistics-chart-option active' : 'statistics-chart-option'}
                key={option.type}
                onClick={() => setChartType(option.type)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="statistics-actions">
          <button className="button button-secondary" disabled={loading} onClick={() => void load(periodIndex, appliedFilters)} type="button">Atualizar dados</button>
          <button className="button button-secondary" disabled={!data || loading} onClick={handleDownload} type="button">Baixar CSV</button>
          <button className="button button-secondary" disabled={!data || loading || generatingPdf} onClick={() => void handleDownloadPdf()} type="button">
            {generatingPdf ? 'Gerando PDF...' : 'Baixar PDF'}
          </button>
          <button className="button button-primary" disabled={!data || loading} onClick={handlePrint} type="button">Imprimir</button>
        </div>
      </section>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {loading && !data ? (
        <div className="loading-state">Carregando estatísticas...</div>
      ) : data && (
        <>
          <section className="statistics-metrics" aria-label="Resumo do período">
            <article className="statistics-metric card">
              <span>Alunos visíveis</span>
              <strong>{formatNumber(data.totals.students)}</strong>
              <small>{formatNumber(data.totals.subjectRecords)} registro(s) de matéria</small>
            </article>
            <article className="statistics-metric card">
              <span>Média geral</span>
              <strong>{formatGrade(data.totals.averageGrade)}</strong>
              <small>escala de 0 a 100</small>
            </article>
            <article className="statistics-metric card">
              <span>Frequência média</span>
              <strong>{formatPercent(data.totals.averageAttendancePercent)}</strong>
              <small>percentual de faltas</small>
            </article>
            <article className="statistics-metric statistics-metric-risk card">
              <span>Em risco</span>
              <strong>{formatNumber(data.totals.atRisk)}</strong>
              <small>requerem acompanhamento</small>
            </article>
            <article className="statistics-metric statistics-metric-warning card">
              <span>Em alerta</span>
              <strong>{formatNumber(data.totals.alert)}</strong>
              <small>próximos ao limite</small>
            </article>
          </section>

          <section className="statistics-evolution card" aria-labelledby="statistics-evolution-heading">
            <div className="section-heading statistics-evolution-heading">
              <div>
                <p className="eyebrow">Histórico anual</p>
                <h2 id="statistics-evolution-heading">Evolução por período</h2>
                <p className="muted">A comparação usa exclusivamente os retratos salvos de cada período e respeita seu escopo atual.</p>
              </div>
              <span className="statistics-evolution-count">{savedEvolution.length} de {evolution.length} período(s) com histórico</span>
            </div>
            {availableEvolution.length === 0 ? (
              <div className="statistics-chart-empty">
                {savedEvolution.length > 0
                  ? 'Há históricos salvos, mas eles não possuem registros para o filtro atual.'
                  : 'Ainda não há históricos salvos para comparar. Administradores podem salvar o período atual acima.'}
              </div>
            ) : (
              <div className="statistics-evolution-chart">
                <StatisticsChart data={evolutionGradeData} title="Média geral por período" type="line" valueLabel={formatGrade} />
              </div>
            )}
            <div className="table-wrap statistics-evolution-table">
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Histórico</th>
                    <th>Alunos</th>
                    <th>Média</th>
                    <th>Faltas (%)</th>
                    <th>Risco</th>
                    <th>Alerta</th>
                  </tr>
                </thead>
                <tbody>
                  {evolution.map((item) => (
                    <tr key={item.periodIndex}>
                      <td><strong>{item.label}</strong></td>
                      <td>
                        <span className={item.available ? 'statistics-history-status saved' : 'statistics-history-status pending'}>
                          {item.available ? 'Salvo' : 'Não salvo'}
                        </span>
                      </td>
                      {item.available && item.hasVisibleRecords ? (
                        <>
                          <td>{formatNumber(item.students)}</td>
                          <td>{formatGrade(item.averageGrade)}</td>
                          <td>{formatPercent(item.averageAttendancePercent)}</td>
                          <td>{formatNumber(item.atRisk)}</td>
                          <td>{formatNumber(item.alert)}</td>
                        </>
                      ) : item.available ? (
                        <>
                          <td>0</td>
                          <td>{formatGrade(0)}</td>
                          <td>{formatPercent(0)}</td>
                          <td>0</td>
                          <td className="statistics-filter-empty-cell">
                            <strong>0</strong>
                            <small>Sem registros neste filtro</small>
                          </td>
                        </>
                      ) : (
                        <td colSpan={5} className="statistics-no-history">
                          Nenhum retrato salvo
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="statistics-chart-grid" aria-label="Gráficos acadêmicos">
            <article className="statistics-chart-card card">
              <div className="statistics-card-heading">
                <div>
                  <h2>Situação acadêmica</h2>
                  <p className="muted">Distribuição entre regular, alerta e risco.</p>
                </div>
              </div>
              <StatisticsChart data={statusData} title="Situação acadêmica" type={chartType} />
            </article>

            <article className="statistics-chart-card card">
              <div className="statistics-card-heading">
                <div>
                  <h2>Faixas de nota</h2>
                  <p className="muted">Quantidade de alunos por faixa de desempenho.</p>
                </div>
              </div>
              <StatisticsChart data={gradeData} title="Faixas de nota" type={chartType} />
            </article>

            <article className="statistics-chart-card card">
              <div className="statistics-card-heading">
                <div>
                  <h2>Faltas</h2>
                  <p className="muted">Distribuição pelo percentual de faltas líquidas.</p>
                </div>
              </div>
              <StatisticsChart data={attendanceData} title="Distribuição de faltas" type={chartType} />
            </article>

            <article className="statistics-chart-card card">
              <div className="statistics-card-heading">
                <div>
                  <h2>Média por matéria</h2>
                  <p className="muted">Notas médias das matérias disponíveis no escopo.</p>
                </div>
              </div>
              <StatisticsChart data={subjectData} title="Média por matéria" type={chartType} valueLabel={formatGrade} />
            </article>
          </section>

          <section className="statistics-subjects card">
            <div className="section-heading">
              <div>
                <h2>Detalhamento por matéria</h2>
                <p className="muted">Resumo numérico que acompanha os gráficos acima.</p>
              </div>
            </div>
            {data.subjectAverages.length === 0 ? (
              <div className="empty-state">Nenhuma matéria está disponível para o período selecionado.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Matéria</th>
                      <th>Alunos</th>
                      <th>Média</th>
                      <th>Faltas (%)</th>
                      <th>Risco</th>
                      <th>Alerta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subjectAverages.map((subject) => (
                      <tr key={subject.subject}>
                        <td><strong>{subject.subject}</strong></td>
                        <td>{formatNumber(subject.studentCount)}</td>
                        <td>{formatGrade(subject.averageGrade)}</td>
                        <td>{formatPercent(subject.averageAttendancePercent)}</td>
                        <td>{formatNumber(subject.atRisk)}</td>
                        <td>{formatNumber(subject.alert)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}

/** Papel de `ResearchPage`: apresenta uma área do sistema e coordena seus componentes, estado local e chamadas à API conforme as permissões da pessoa usuária.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from '../utils/api'
import type { User } from '../types'
import { createResearchReport } from '../utils/researchReport'

interface ResearchSummary {
  profileCount: number
  statusCounts: Array<{ label: string; value: number }>
  cohorts: Array<{ year: number; total: number; desvinculados: number }>
  consentedSurveys: number
  interviews: Array<{ label: string; value: number }>
  models: Array<{ id: number; model_name: string; version: string; status: string; variables: unknown[]; metrics: Record<string, unknown>; criado_em: string }>
  activity: Array<{ operation: string; description: string; record_count: number; actor: string; criado_em: string }>
}

interface ResearchPageProps {
  user: User
  onMessage: (message: string) => void
  onError: (error: unknown) => string
}

const template = [
  { anonimo: true, ano_ingresso: 2024, raca_etnia: 'NAO_INFORMADA', genero: '', condicao_socioeconomica: '', situacao_vinculo: 'ATIVO', assistencia_estudantil: '', auxilios: [] },
]

export function ResearchPage({ user, onMessage, onError }: ResearchPageProps) {
  const [summary, setSummary] = useState<ResearchSummary | null>(null)
  const [rawImport, setRawImport] = useState(JSON.stringify(template, null, 2))
  const [modelName, setModelName] = useState('Indicador composto de evasão')
  const [modelVersion, setModelVersion] = useState('0.1.0')
  const [variables, setVariables] = useState('[]')
  const [metrics, setMetrics] = useState('{}')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getResearchSummary()
      setSummary(result.data)
      setError('')
    } catch (requestError) {
      setError(onError(requestError))
    } finally { setLoading(false) }
  }, [onError])

  useEffect(() => { void load() }, [load])

  async function importProfiles() {
    setSaving(true); setError('')
    try {
      const records = JSON.parse(rawImport)
      if (!Array.isArray(records)) throw new Error('Os dados devem ser uma lista JSON.')
      const result = await api.importResearchProfiles(records)
      onMessage(result.message || 'Perfis de pesquisa importados.')
      await load()
    } catch (requestError) { setError(requestError instanceof SyntaxError ? 'JSON inválido.' : onError(requestError)) }
    finally { setSaving(false) }
  }

  async function createModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const result = await api.createResearchModel({
        nome: modelName, versao: modelVersion,
        variaveis: JSON.parse(variables), metricas: JSON.parse(metrics), status: 'experimental',
      })
      onMessage(result.message || 'Versão experimental documentada.')
      await load()
    } catch (requestError) { setError(requestError instanceof SyntaxError ? 'JSON inválido nos metadados do modelo.' : onError(requestError)) }
    finally { setSaving(false) }
  }

  async function downloadExport() {
    try {
      const payload = await api.exportResearchData()
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload.data, null, 2)], { type: 'application/json;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'sgac-pesquisa-anonimizada.json'; anchor.click()
      URL.revokeObjectURL(url)
    } catch (requestError) { setError(onError(requestError)) }
  }

  async function downloadReport() {
    setDownloadingReport(true)
    try {
      const result = await api.getResearchReportData()
      const blob = createResearchReport(result.data, new Date())
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'relatorio-operacoes-pesquisa-pipad.docx'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (requestError) { setError(onError(requestError)) }
    finally { setDownloadingReport(false) }
  }

  if (user.role !== 'Admin') return <section className="page-section"><h1>Pesquisa PIPAD</h1><p>Acesso restrito.</p></section>

  return <section className="page-section research-page">
    <header className="page-header"><div><p className="eyebrow">Ferramentas administrativas</p><h1>Pesquisa PIPAD</h1><p>Coortes, dados de pesquisa consentidos e documentação experimental do indicador.</p></div><div className="page-header-actions"><button className="button button-secondary" disabled={downloadingReport} onClick={() => void downloadReport()} type="button">{downloadingReport ? 'Gerando relatório…' : 'Baixar relatório Word'}</button><button className="button button-secondary" disabled={loading} onClick={() => void load()} type="button">Atualizar</button></div></header>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <aside className="alert alert-info" role="note">Esta área não substitui aprovação do CEP, TCLE/TALE ou governança institucional. Use apenas dados autorizados; não importe nomes, CPF ou áudio de participantes. A exportação usa identificadores pseudonimizados e ainda requer controle de acesso.</aside>
    {loading ? <p aria-live="polite" role="status">Carregando dados da pesquisa…</p> : <>
      <div className="research-metrics">
        <article><span>Perfis importados</span><strong>{summary?.profileCount ?? 0}</strong></article>
        <article><span>Surveys consentidos</span><strong>{summary?.consentedSurveys ?? 0}</strong></article>
        <article><span>Coortes</span><strong>{summary?.cohorts.length ?? 0}</strong></article>
        <article><span>Modelos documentados</span><strong>{summary?.models.length ?? 0}</strong></article>
      </div>
      <div className="card research-card"><div className="page-header"><div><h2>Importar perfis e coortes</h2><p>JSON de dados autorizados ou previamente anonimizados. Para anonimizar um registro, use <code>anonimo: true</code> e omita a matrícula.</p></div><button className="button button-secondary" onClick={() => void downloadExport()} type="button">Baixar exportação pseudonimizada</button></div>
        <label>Registros JSON<textarea aria-label="Registros JSON de pesquisa" className="research-json" onChange={(event) => setRawImport(event.target.value)} rows={12} value={rawImport} /></label>
        <button className="button button-primary" disabled={saving} onClick={() => void importProfiles()} type="button">{saving ? 'Salvando…' : 'Importar registros'}</button>
      </div>
      <div className="research-grid">
        <div className="card research-card"><h2>Perfil institucional</h2><div className="table-wrap"><table><thead><tr><th>Raça/etnia ou situação</th><th>Quantidade</th></tr></thead><tbody>{(summary?.statusCounts || []).map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.value}</td></tr>)}</tbody></table></div></div>
        <div className="card research-card"><h2>Coortes por ingresso</h2><div className="table-wrap"><table><thead><tr><th>Ano</th><th>Estudantes</th><th>Desvinculados*</th></tr></thead><tbody>{(summary?.cohorts || []).map((row) => <tr key={row.year}><td>{row.year}</td><td>{row.total}</td><td>{row.desvinculados}</td></tr>)}</tbody></table></div><small>*Contagem bruta de situações importadas, não taxa ou predição de evasão.</small></div>
      </div>
      <div className="card research-card"><h2>Documentar versão experimental do indicador</h2><p>Guarde variáveis e métricas de validação para rastreabilidade. Este formulário não treina nem valida um modelo estatístico.</p><form className="stack-form" onSubmit={(event) => void createModel(event)}><div className="form-grid"><label>Nome<input onChange={(event) => setModelName(event.target.value)} required value={modelName} /></label><label>Versão<input onChange={(event) => setModelVersion(event.target.value)} required value={modelVersion} /></label><label>Variáveis JSON<textarea onChange={(event) => setVariables(event.target.value)} rows={4} value={variables} /></label><label>Métricas JSON<textarea onChange={(event) => setMetrics(event.target.value)} rows={4} value={metrics} /></label></div><button className="button button-primary" disabled={saving} type="submit">Registrar como experimental</button></form>
        {summary?.models.map((model) => <article className="research-model" key={model.id}><strong>{model.model_name} v{model.version}</strong><span>{model.status} · {new Date(model.criado_em).toLocaleString('pt-BR')}</span><pre>{JSON.stringify({ variaveis: model.variables, metricas: model.metrics }, null, 2)}</pre></article>)}
      </div>
    </>}
  </section>
}

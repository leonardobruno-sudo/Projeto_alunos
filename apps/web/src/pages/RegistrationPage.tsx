/** Page for manual registration, student movement, and CSV bulk import. */

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { StudentForm } from '../components/StudentForm'
import type { StudentImportResult, StudentMovePayload, StudentPayload, User } from '../types'
import { api } from '../utils/api'

interface RegistrationPageProps {
  user: User
  onMessage: (message: string) => void
  onError: (error: unknown) => string
}

export function RegistrationPage({ user, onMessage, onError }: RegistrationPageProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const [matricula, setMatricula] = useState('')
  const [disciplina, setDisciplina] = useState('')
  const [categoria, setCategoria] = useState('')
  const [turma, setTurma] = useState('')
  const [moveError, setMoveError] = useState('')
  const [moving, setMoving] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState<StudentImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const isAdmin = user.role === 'Admin'

  async function createStudent(payload: StudentPayload): Promise<string> {
    const result = await api.createStudent(payload)
    const message = result.message || 'Aluno cadastrado com sucesso.'
    onMessage(message)
    return message
  }

  async function loadTurmaSubjects(selectedTurma: string): Promise<string[]> {
    const result = await api.getTurmaSubjects(selectedTurma)
    return result.data
  }

  function selectImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setImportError('')
    setImportResult(null)

    if (file && !file.name.toLowerCase().endsWith('.csv')) {
      setImportFile(null)
      event.target.value = ''
      setImportError('Selecione um arquivo no formato CSV.')
      return
    }

    setImportFile(file)
  }

  async function downloadTemplate() {
    setImportError('')
    setDownloadingTemplate(true)
    try {
      await api.downloadStudentTemplate()
      onMessage('Modelo CSV baixado. Preencha-o e envie o arquivo nesta tela.')
    } catch (requestError) {
      setImportError(onError(requestError))
    } finally {
      setDownloadingTemplate(false)
    }
  }

  async function importStudents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setImportError('')
    setImportResult(null)

    if (!importFile) {
      setImportError('Selecione um arquivo CSV para importar.')
      return
    }

    setImporting(true)
    try {
      const result = await api.importStudents(importFile)
      setImportResult(result.data)
      onMessage(result.message || `${result.data.summary.imported} aluno(s) importado(s) com sucesso.`)
      setImportFile(null)
      if (importInputRef.current) importInputRef.current.value = ''
    } catch (requestError) {
      setImportError(onError(requestError))
    } finally {
      setImporting(false)
    }
  }

  async function moveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMoveError('')

    if (!matricula.trim()) {
      setMoveError('Informe a matrícula do aluno.')
      return
    }

    const payload: StudentMovePayload = {}
    if (disciplina.trim()) payload.nova_disciplina = disciplina.trim()
    if (categoria.trim()) payload.nova_categoria = categoria.trim()
    if (turma.trim()) payload.nova_turma = turma.trim()

    if (Object.keys(payload).length === 0) {
      setMoveError('Informe ao menos um novo dado para a movimentação.')
      return
    }

    setMoving(true)
    try {
      const result = await api.moveStudent(matricula.trim(), payload)
      onMessage(result.message || 'Aluno movimentado com sucesso.')
      setMatricula('')
      setDisciplina('')
      setCategoria('')
      setTurma('')
    } catch (requestError) {
      setMoveError(onError(requestError))
    } finally {
      setMoving(false)
    }
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Gestão de alunos</p>
          <h1>Cadastro</h1>
          <p className="muted">Cadastre um novo aluno ou atualize sua turma, categoria ou disciplina.</p>
        </div>
      </div>

      {isAdmin && (
        <section className="card import-card">
          <div className="section-heading">
            <div>
              <h2>Importar alunos por CSV</h2>
              <p className="muted">Baixe o modelo, preencha uma linha para cada aluno e envie o arquivo para cadastro em lote. Cada aluno importado recebe uma conta de acesso.</p>
            </div>
            <button className="button button-secondary" disabled={downloadingTemplate} onClick={downloadTemplate} type="button">
              {downloadingTemplate ? 'Baixando modelo...' : 'Baixar modelo CSV'}
            </button>
          </div>

          {importError && <div className="alert alert-error" role="alert">{importError}</div>}

          <form className="import-form" onSubmit={importStudents}>
            <label className="file-input-label">
              Arquivo CSV
              <input accept=".csv,text/csv" onChange={selectImportFile} ref={importInputRef} type="file" />
            </label>
            <div className="import-file-summary" aria-live="polite">
              {importFile ? `Selecionado: ${importFile.name}` : 'Nenhum arquivo selecionado.'}
            </div>
            <button className="button button-primary" disabled={importing || !importFile} type="submit">
              {importing ? 'Importando...' : 'Importar alunos'}
            </button>
          </form>

          {importResult && (
            <div className="import-result" role="status">
              <h3>Resultado da importação</h3>
              <div className="import-summary">
                <span><strong>{importResult.summary.imported}</strong> importado(s)</span>
                <span><strong>{importResult.summary.skipped}</strong> ignorado(s)</span>
                <span><strong>{importResult.summary.errors}</strong> erro(s)</span>
              </div>
              {importResult.errors.length > 0 && (
                <div className="import-errors">
                  <p>Revise as linhas abaixo e envie um novo arquivo apenas com os registros corrigidos.</p>
                  <ul>
                    {importResult.errors.map((error, index) => (
                      <li key={`${error.line}-${index}`}>
                        Linha {error.line}: {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="two-column-layout">
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Novo aluno</h2>
              <p className="muted">Os campos obrigatórios são matrícula, nome e turma. O usuário é a matrícula e a senha inicial segue o padrão IFRR.matrícula@primeiroNome; peça ao aluno para alterá-la após entrar.</p>
            </div>
          </div>
          <StudentForm
            mode="create"
            onLoadTurmaSubjects={loadTurmaSubjects}
            onSubmit={createStudent}
            submitLabel="Cadastrar aluno"
          />
        </section>

        <section className="card move-card">
          <div className="section-heading">
            <div>
              <h2>Movimentar aluno</h2>
              <p className="muted">Altere somente os campos que precisam ser atualizados.</p>
            </div>
          </div>
          {moveError && <div className="alert alert-error" role="alert">{moveError}</div>}
          <form className="stack-form" onSubmit={moveStudent}>
            <label>
              Matrícula
              <input onChange={(event) => setMatricula(event.target.value)} required value={matricula} />
            </label>
            <label>
              Nova disciplina
              <input onChange={(event) => setDisciplina(event.target.value)} value={disciplina} />
            </label>
            <label>
              Nova categoria
              <select onChange={(event) => setCategoria(event.target.value)} value={categoria}>
                <option value="">Não alterar</option>
                <option value="Integrado">Integrado</option>
                <option value="Subsequente">Subsequente</option>
                <option value="Superior">Superior</option>
                <option value="Proeja">Proeja</option>
              </select>
            </label>
            <label>
              Nova turma
              <input onChange={(event) => setTurma(event.target.value)} value={turma} />
            </label>
            <button className="button button-primary" disabled={moving} type="submit">
              {moving ? 'Movendo...' : 'Salvar movimentação'}
            </button>
          </form>
        </section>
      </div>
    </section>
  )
}

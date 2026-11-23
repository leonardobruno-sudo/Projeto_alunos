/** Papel de `researchReport`: transforma, valida ou transporta dados entre a interface e os formatos usados pela API ou por arquivos exportados.
 * Ele se conecta aos serviços e componentes importados e entrega sua saída a quem o consome.
 */

/**
 * Monta um relatório Word (DOCX) no navegador a partir do resumo já recebido
 * pela tela de pesquisa. Constrói os arquivos XML e o pacote ZIP esperado pelo
 * Word, sem enviar uma nova operação ou conteúdo de relatório ao servidor.
 */
export interface ResearchReportData {
  profileCount: number
  statusCounts: Array<{ label: string; value: number }>
  cohorts: Array<{ year: number; total: number; desvinculados: number }>
  consentedSurveys: number
  interviews: Array<{ label: string; value: number }>
  models: Array<{ model_name: string; version: string; status: string; criado_em: string }>
  activity: Array<{ operation: string; description: string; record_count: number; actor: string; criado_em: string }>
}

// Escapa o conteúdo antes de inseri-lo em XML, preservando nomes e descrições.
const encoder = new TextEncoder()
const xml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

// Converte um texto em parágrafo OOXML e aplica o estilo visual solicitado.
function paragraph(text: unknown, style = '', bold = false): string {
  const pStyle = style ? `<w:pStyle w:val="${style}"/>` : ''
  const rPr = bold ? '<w:rPr><w:b/></w:rPr>' : ''
  return `<w:p><w:pPr>${pStyle}<w:spacing w:after="120"/></w:pPr><w:r>${rPr}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`
}

// Cria célula de tabela; o cabeçalho recebe destaque para guiar a leitura.
function cell(text: unknown, header = false): string {
  const fill = header ? '<w:shd w:fill="DCE6F1"/>' : ''
  const bold = header ? '<w:b/>' : ''
  return `<w:tc><w:tcPr><w:tcMar><w:top w:w="80" w:type="dxa"/><w:start w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:end w:w="100" w:type="dxa"/></w:tcMar>${fill}</w:tcPr><w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr>${bold}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p></w:tc>`
}

// Combina cabeçalho e linhas de dados recebidos pela tela em uma tabela Word.
function table(headers: string[], rows: unknown[][]): string {
  const rowXml = [headers, ...rows].map((row, index) => `<w:tr>${row.map((value) => cell(value, index === 0)).join('')}</w:tr>`).join('')
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C9D6"/><w:left w:val="single" w:sz="4" w:color="B7C9D6"/><w:bottom w:val="single" w:sz="4" w:color="B7C9D6"/><w:right w:val="single" w:sz="4" w:color="B7C9D6"/><w:insideH w:val="single" w:sz="4" w:color="D9E2EA"/><w:insideV w:val="single" w:sz="4" w:color="D9E2EA"/></w:tblBorders>'
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:start w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:end w:w="100" w:type="dxa"/></w:tblCellMar>${borders}</w:tblPr>${rowXml}</w:tbl>`
}

function documentXml(data: ResearchReportData, generatedAt: Date): string {
  const activeModels = data.models.map((model) => [`${model.model_name} v${model.version}`, model.status, new Date(model.criado_em).toLocaleString('pt-BR')])
  const events = data.activity.map((event) => [new Date(event.criado_em).toLocaleString('pt-BR'), event.operation, event.description, event.record_count, event.actor])
  const body = [
    paragraph('Relatório das operações de pesquisa PIPAD', 'Title'),
    paragraph(`Sistema de Gerenciamento de Alunos Cotistas · Gerado em ${generatedAt.toLocaleString('pt-BR')}`),
    paragraph('Este relatório resume os dados disponíveis no módulo Pesquisa PIPAD e as operações administrativas registradas. A contagem de desligamentos é descritiva e não representa um indicador preditivo validado.'),
    paragraph('Resumo do módulo', 'Heading1'),
    table(['Indicador', 'Quantidade'], [['Perfis de coorte', data.profileCount], ['Surveys consentidos', data.consentedSurveys], ['Versões de modelo registradas', data.models.length], ['Operações registradas', data.activity.length]]),
    paragraph('Situação dos vínculos', 'Heading1'),
    table(['Situação', 'Registros'], data.statusCounts.map((row) => [row.label, row.value])),
    paragraph('Coortes por ano de ingresso', 'Heading1'),
    table(['Ano', 'Estudantes', 'Desvinculados*'], data.cohorts.map((row) => [row.year, row.total, row.desvinculados])),
    paragraph('* Soma de situações importadas classificadas como evadido, cancelado ou trancado; não é uma taxa ajustada.'),
    paragraph('Entrevistas', 'Heading1'),
    table(['Situação', 'Registros'], data.interviews.map((row) => [row.label, row.value])),
    paragraph('Modelos documentados', 'Heading1'),
    table(['Modelo', 'Estado', 'Data de registro'], activeModels.length ? activeModels : [['Nenhum modelo registrado', '', '']]),
    paragraph('Operações registradas', 'Heading1'),
    table(['Data e hora', 'Operação', 'Descrição', 'Registros', 'Admin'], events.length ? events : [['Sem operações registradas', '', '', '', '']]),
    paragraph('O histórico apresenta até as 500 operações mais recentes. Ele contém eventos registrados a partir da ativação do log no sistema.'),
  ].join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true) }
function u32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true) }

function zip(files: Array<{ name: string; content: string }>): Blob {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const content = encoder.encode(file.content)
    const crc = crc32(content)
    const local = new Uint8Array(30 + name.length + content.length)
    const lv = new DataView(local.buffer)
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0)
    u32(lv, 14, crc); u32(lv, 18, content.length); u32(lv, 22, content.length); u16(lv, 26, name.length)
    local.set(name, 30); local.set(content, 30 + name.length); locals.push(local)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0)
    u32(cv, 16, crc); u32(cv, 20, content.length); u32(cv, 24, content.length); u16(cv, 28, name.length); u32(cv, 42, offset)
    central.set(name, 46); centrals.push(central); offset += local.length
  }
  const centralSize = centrals.reduce((sum, value) => sum + value.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length); u32(ev, 12, centralSize); u32(ev, 16, offset)
  const parts = [...locals, ...centrals, end].map((value) => value.slice().buffer as ArrayBuffer)
  return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

export function createResearchReport(data: ResearchReportData, generatedAt = new Date()): Blob {
  const types = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  const styles = `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="280"/></w:pPr><w:rPr><w:b/><w:color w:val="243B64"/><w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="354777"/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`
  return zip([
    { name: '[Content_Types].xml', content: types },
    { name: '_rels/.rels', content: rels },
    { name: 'word/document.xml', content: documentXml(data, generatedAt) },
    { name: 'word/_rels/document.xml.rels', content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'word/styles.xml', content: styles },
  ])
}

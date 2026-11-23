/**
 * Papel de `academicLifeSchema`: implementa regras de negócio do domínio e conversa com os serviços compartilhados e o banco sem depender da interface.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Define a estrutura incremental das tabelas de Vida Acadêmica.
 *
 * Este esquema fica junto ao módulo e não altera a representação legada
 * `alunos.materias_json`. Os relatórios existentes continuam usando
 * os dados consolidados das matérias, enquanto novos diários mantêm
 * aulas, frequências e avaliações em registros próprios desde o início.
 */
'use strict';

async function ensureAcademicColumn(allSql, runSql, tableName, column) {
  // `CREATE TABLE IF NOT EXISTS` não atualiza uma tabela criada por uma versão
  // anterior. Consultamos os metadados do SQLite para que esta
  // migração possa ser executada com segurança a cada inicialização.
  const columns = await allSql(`PRAGMA table_info(${tableName})`);
  if (columns.some((existing) => existing.name === column.name)) return;
  await runSql(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`);
}

async function setupAcademicLifeSchema(runSql, allSql) {
  // O SQLite só aplica chaves estrangeiras declaradas quando esta configuração
  // está ativa. As tabelas antigas não dependem de exclusão em cascata, portanto
  // podemos ativá-la antes de criar novos registros relacionados.
  await runSql('PRAGMA foreign_keys = ON');

  await runSql(`CREATE TABLE IF NOT EXISTS calendarios_academicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      curso TEXT NOT NULL,
      turma TEXT,
      periodo INTEGER NOT NULL CHECK (periodo >= 0 AND periodo < 6),
      inicio_em TEXT NOT NULL,
      fim_em TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
      criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      CHECK (length(trim(titulo)) > 0),
      CHECK (length(trim(curso)) > 0),
      CHECK (inicio_em <= fim_em)
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS eventos_academicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calendario_id INTEGER NOT NULL REFERENCES calendarios_academicos(id) ON DELETE CASCADE,
      titulo TEXT NOT NULL,
      descricao TEXT,
      tipo TEXT NOT NULL DEFAULT 'Academico'
        CHECK (tipo IN ('Academico', 'Avaliacao', 'Reuniao', 'Prazo', 'Outro')),
      inicio_em TEXT NOT NULL,
      fim_em TEXT NOT NULL,
      visivel_para_alunos INTEGER NOT NULL DEFAULT 1 CHECK (visivel_para_alunos IN (0, 1)),
      criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      CHECK (length(trim(titulo)) > 0),
      CHECK (inicio_em <= fim_em)
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS diarios_turma (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso TEXT NOT NULL,
      turma TEXT NOT NULL,
      disciplina TEXT NOT NULL,
      periodo INTEGER NOT NULL CHECK (periodo >= 0 AND periodo < 6),
      professor_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
      criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      CHECK (length(trim(curso)) > 0),
      CHECK (length(trim(turma)) > 0),
      CHECK (length(trim(disciplina)) > 0)
    )`);

  // A matrícula no diário é independente do JSON legado de matérias. Assim,
  // o aluno consulta somente os diários em que foi inscrito explicitamente e
  // pode cursar várias matérias e turmas sem duplicar dados de frequência.
  await runSql(`CREATE TABLE IF NOT EXISTS matriculas_diario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diario_id INTEGER NOT NULL REFERENCES diarios_turma(id) ON DELETE CASCADE,
      matricula TEXT NOT NULL REFERENCES alunos(matricula) ON DELETE CASCADE,
      ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
      matriculado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      matriculado_em TEXT NOT NULL,
      UNIQUE (diario_id, matricula)
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS aulas_diario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diario_id INTEGER NOT NULL REFERENCES diarios_turma(id) ON DELETE CASCADE,
      data_aula TEXT NOT NULL,
      titulo TEXT NOT NULL,
      conteudo TEXT,
      carga_horaria REAL NOT NULL DEFAULT 1 CHECK (carga_horaria > 0 AND carga_horaria <= 24),
      criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      CHECK (length(trim(titulo)) > 0)
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS frequencias_aula (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aula_id INTEGER NOT NULL REFERENCES aulas_diario(id) ON DELETE CASCADE,
      matricula TEXT NOT NULL REFERENCES alunos(matricula) ON DELETE CASCADE,
      situacao TEXT NOT NULL CHECK (situacao IN ('PRESENTE', 'FALTA', 'JUSTIFICADA')),
      observacao TEXT,
      registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      registrado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      UNIQUE (aula_id, matricula)
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS avaliacoes_diario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diario_id INTEGER NOT NULL REFERENCES diarios_turma(id) ON DELETE CASCADE,
      titulo TEXT NOT NULL,
      descricao TEXT,
      data_avaliacao TEXT NOT NULL,
      peso REAL NOT NULL DEFAULT 1 CHECK (peso > 0 AND peso <= 100),
      nota_maxima REAL NOT NULL DEFAULT 100 CHECK (nota_maxima > 0 AND nota_maxima <= 1000),
      criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      CHECK (length(trim(titulo)) > 0)
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS notas_avaliacao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      avaliacao_id INTEGER NOT NULL REFERENCES avaliacoes_diario(id) ON DELETE CASCADE,
      matricula TEXT NOT NULL REFERENCES alunos(matricula) ON DELETE CASCADE,
      nota REAL NOT NULL CHECK (nota >= 0),
      observacao TEXT,
      lancado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      lancado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      UNIQUE (avaliacao_id, matricula)
    )`);

  // Requerimentos e metadados dos documentos ficam separados dos arquivos binários.
  // Isso permite um fluxo auditável na interface React sem tratar
  // um relatório gerado localmente como documento institucional.
  await runSql(`CREATE TABLE IF NOT EXISTS requerimentos_academicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matricula TEXT NOT NULL REFERENCES alunos(matricula) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      descricao TEXT,
      periodo INTEGER CHECK (periodo >= 0 AND periodo < 6),
      status TEXT NOT NULL DEFAULT 'ABERTO'
        CHECK (status IN ('ABERTO', 'EM_ANALISE', 'CONCLUIDO', 'INDEFERIDO')),
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      CHECK (length(trim(tipo)) > 0)
    )`);

  // Instalações antigas podem ter uma primeira versão desta tabela ainda sem
  // período. Registros sem período continuam sendo requerimentos gerais.
  await ensureAcademicColumn(allSql, runSql, 'requerimentos_academicos', {
    name: 'periodo',
    definition: 'INTEGER CHECK (periodo >= 0 AND periodo < 6)'
  });

  await runSql(`CREATE TABLE IF NOT EXISTS documentos_academicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matricula TEXT NOT NULL REFERENCES alunos(matricula) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      periodo INTEGER CHECK (periodo >= 0 AND periodo < 6),
      referencia_externa TEXT,
      status TEXT NOT NULL DEFAULT 'DISPONIVEL'
        CHECK (status IN ('DISPONIVEL', 'ARQUIVADO')),
      criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      CHECK (length(trim(tipo)) > 0),
      CHECK (length(trim(titulo)) > 0)
    )`);

  await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS diarios_turma_escopo_unico_idx
    ON diarios_turma (lower(trim(curso)), lower(trim(turma)), lower(trim(disciplina)), periodo)`);
  await runSql(`CREATE INDEX IF NOT EXISTS calendarios_academicos_escopo_idx
    ON calendarios_academicos (lower(trim(curso)), lower(trim(turma)), periodo)`);
  await runSql(`CREATE INDEX IF NOT EXISTS eventos_academicos_calendario_idx
    ON eventos_academicos (calendario_id, inicio_em)`);
  await runSql(`CREATE INDEX IF NOT EXISTS matriculas_diario_matricula_idx
    ON matriculas_diario (lower(trim(matricula)), diario_id, ativa)`);
  await runSql(`CREATE INDEX IF NOT EXISTS aulas_diario_diario_idx
    ON aulas_diario (diario_id, data_aula, id)`);
  await runSql(`CREATE INDEX IF NOT EXISTS frequencias_aula_matricula_idx
    ON frequencias_aula (lower(trim(matricula)), aula_id)`);
  await runSql(`CREATE INDEX IF NOT EXISTS avaliacoes_diario_diario_idx
    ON avaliacoes_diario (diario_id, data_avaliacao, id)`);
  await runSql(`CREATE INDEX IF NOT EXISTS notas_avaliacao_matricula_idx
    ON notas_avaliacao (lower(trim(matricula)), avaliacao_id)`);
  await runSql(`CREATE INDEX IF NOT EXISTS requerimentos_academicos_matricula_idx
    ON requerimentos_academicos (lower(trim(matricula)), status, criado_em)`);
  await runSql(`CREATE INDEX IF NOT EXISTS requerimentos_academicos_periodo_idx
    ON requerimentos_academicos (lower(trim(matricula)), periodo, status, criado_em)`);
  await runSql(`CREATE INDEX IF NOT EXISTS documentos_academicos_matricula_idx
    ON documentos_academicos (lower(trim(matricula)), periodo, status)`);
}

module.exports = {
  setupAcademicLifeSchema
};

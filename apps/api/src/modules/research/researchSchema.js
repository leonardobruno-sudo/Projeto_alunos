/**
 * Papel de `researchSchema`: implementa regras de negócio do domínio e conversa com os serviços compartilhados e o banco sem depender da interface.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
'use strict';

/**
 * Define tabelas e índices do fluxo PIPAD durante a inicialização do banco.
 * O módulo de banco chama esta migração; os dados de pesquisa ficam separados
 * das contas de acesso e do boletim acadêmico usado pelas telas convencionais.
 */
async function setupResearchSchema(runSql) {
  await runSql(`CREATE TABLE IF NOT EXISTS research_profile (
    student_key TEXT PRIMARY KEY,
    matricula TEXT,
    ano_ingresso INTEGER,
    raca_etnia TEXT,
    genero TEXT,
    condicao_socioeconomica TEXT,
    situacao_vinculo TEXT,
    assistencia_estudantil TEXT,
    auxilios_json TEXT NOT NULL DEFAULT '[]',
    atualizado_em TEXT NOT NULL
  )`);
  await runSql(`CREATE TABLE IF NOT EXISTS research_survey (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_key TEXT NOT NULL,
    consent_status TEXT NOT NULL,
    respostas_json TEXT NOT NULL,
    criado_em TEXT NOT NULL
  )`);
  await runSql(`CREATE TABLE IF NOT EXISTS research_interviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_key TEXT NOT NULL,
    consent_status TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planejada',
    notas_anonimas TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  )`);
  await runSql(`CREATE TABLE IF NOT EXISTS research_risk_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL,
    version TEXT NOT NULL,
    variables_json TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'experimental',
    criado_em TEXT NOT NULL,
    UNIQUE(model_name, version)
  )`);
  await runSql(`CREATE TABLE IF NOT EXISTS research_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL,
    description TEXT NOT NULL,
    record_count INTEGER NOT NULL DEFAULT 0,
    actor TEXT NOT NULL,
    criado_em TEXT NOT NULL
  )`);
  await runSql('CREATE INDEX IF NOT EXISTS research_profile_cohort_idx ON research_profile (ano_ingresso, situacao_vinculo)');
  await runSql('CREATE INDEX IF NOT EXISTS research_survey_student_idx ON research_survey (student_key)');
  await runSql('CREATE INDEX IF NOT EXISTS research_activity_date_idx ON research_activity (criado_em DESC, id DESC)');
}

module.exports = { setupResearchSchema };

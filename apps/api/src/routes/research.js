/**
 * Papel de `research`: recebe requisições HTTP, valida sessão e entrada, aplica permissões e encaminha os dados à regra de negócio ou ao banco.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { allSql, getSql, runSql } = require('../lib/database');
const { ensureAuth } = require('../lib/helpers');
const { apiSuccess, apiCreated, apiBadRequest, apiForbidden, apiServerError } = require('../lib/apiResponse');

const router = express.Router();
const PERIODS = new Set(['ATIVO', 'EVADIDO', 'CONCLUINTE', 'TRANCADO', 'CANCELADO', 'AFASTADO']);
const RACES = new Set(['BRANCA', 'PRETA', 'PARDA', 'AMARELA', 'INDIGENA', 'NAO_INFORMADA']);
const MAX_JSON = 20_000;
function isAdmin(req) { return req.session?.user?.role === 'Admin'; }
function validText(value, limit = 120) { return typeof value === 'string' && value.trim().length <= limit; }
function cleanJson(value, fallback = {}) {
  try { const text = JSON.stringify(value ?? fallback); return text.length <= MAX_JSON ? text : null; }
  catch { return null; }
}
function jsonDownload(res, name, data) {
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  return res.send(JSON.stringify(data, null, 2));
}
async function logActivity(req, operation, description, count = 0) {
  await runSql('INSERT INTO research_activity (operation, description, record_count, actor, criado_em) VALUES (?, ?, ?, ?, ?)',
    [operation, description, count, String(req.session.user.username || 'Admin').slice(0, 120), new Date().toISOString()]);
}

router.use(ensureAuth, (req, res, next) => isAdmin(req)
  ? next()
  : apiForbidden(res, 'O módulo de pesquisa é restrito à equipe administrativa autorizada.'));

async function getResearchSummary() {
    const [profileCount, statusRows, cohortRows, surveyCount, interviewRows, models, activityRows] = await Promise.all([
      getSql('SELECT COUNT(*) AS n FROM research_profile'),
      allSql('SELECT situacao_vinculo AS label, COUNT(*) AS value FROM research_profile GROUP BY situacao_vinculo ORDER BY label'),
      allSql(`SELECT ano_ingresso AS year, COUNT(*) AS total,
        SUM(CASE WHEN situacao_vinculo IN ('EVADIDO','CANCELADO','TRANCADO') THEN 1 ELSE 0 END) AS desvinculados
        FROM research_profile WHERE ano_ingresso IS NOT NULL GROUP BY ano_ingresso ORDER BY ano_ingresso`),
      getSql('SELECT COUNT(*) AS n FROM research_survey WHERE consent_status = \'consentido\''),
      allSql('SELECT status AS label, COUNT(*) AS value FROM research_interviews GROUP BY status ORDER BY status'),
      allSql('SELECT id, model_name, version, variables_json, metrics_json, status, criado_em FROM research_risk_models ORDER BY id DESC'),
      allSql('SELECT id, operation, description, record_count, actor, criado_em FROM research_activity ORDER BY id DESC LIMIT 500')
    ]);
    return {
      profileCount: profileCount?.n || 0, statusCounts: statusRows, cohorts: cohortRows,
      consentedSurveys: surveyCount?.n || 0, interviews: interviewRows,
      models: models.map((row) => ({ ...row, variables: JSON.parse(row.variables_json), metrics: JSON.parse(row.metrics_json), variables_json: undefined, metrics_json: undefined })),
      activity: activityRows
    };
}

router.get('/resumo', async (_req, res) => {
  try {
    return apiSuccess(res, await getResearchSummary());
  } catch (error) { console.error('Erro ao resumir pesquisa:', error); return apiServerError(res); }
});

router.post('/relatorio', async (req, res) => {
  try {
    await logActivity(req, 'Geração de relatório Word', 'Relatório de operações do módulo gerado.', 0);
    return apiSuccess(res, await getResearchSummary());
  } catch (error) { console.error('Erro ao gerar relatório de pesquisa:', error); return apiServerError(res); }
});

router.post('/perfis/importar', async (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length > 5000) return apiBadRequest(res, 'Envie uma lista de até 5.000 registros.');
  const prepared = [];
  for (const [index, item] of records.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return apiBadRequest(res, `Registro ${index + 1} inválido.`);
    const matricula = typeof item.matricula === 'string' ? item.matricula.trim() : '';
    const anon = item.anonimo === true;
    if ((!anon && (!matricula || matricula.length > 80)) || (anon && matricula)) return apiBadRequest(res, `Registro ${index + 1}: informe matrícula ou anonimo=true, sem ambos.`);
    const year = item.ano_ingresso == null || item.ano_ingresso === '' ? null : Number(item.ano_ingresso);
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2200)) return apiBadRequest(res, `Registro ${index + 1}: ano inválido.`);
    const race = String(item.raca_etnia || 'NAO_INFORMADA').trim().toUpperCase();
    const status = String(item.situacao_vinculo || 'ATIVO').trim().toUpperCase();
    if (!RACES.has(race) || !PERIODS.has(status)) return apiBadRequest(res, `Registro ${index + 1}: raça/etnia ou situação inválida.`);
    if (item.genero != null && !validText(item.genero, 80)) return apiBadRequest(res, `Registro ${index + 1}: gênero inválido.`);
    if (item.condicao_socioeconomica != null && !validText(item.condicao_socioeconomica, 120)) return apiBadRequest(res, `Registro ${index + 1}: condição socioeconômica inválida.`);
    if (item.assistencia_estudantil != null && !validText(item.assistencia_estudantil, 120)) return apiBadRequest(res, `Registro ${index + 1}: situação de assistência inválida.`);
    const auxilios = cleanJson(Array.isArray(item.auxilios) ? item.auxilios.slice(0, 50) : []);
    if (!auxilios) return apiBadRequest(res, `Registro ${index + 1}: lista de auxílios muito longa.`);
    const key = anon ? `anon:${crypto.randomUUID()}` : `mat:${matricula.toLocaleLowerCase('pt-BR')}`;
    prepared.push([key, matricula || null, year, race, item.genero?.trim() || null,
      item.condicao_socioeconomica?.trim() || null, status,
      item.assistencia_estudantil?.trim() || null, auxilios, new Date().toISOString()]);
  }
  try {
    for (const row of prepared) await runSql(`INSERT INTO research_profile
      (student_key, matricula, ano_ingresso, raca_etnia, genero, condicao_socioeconomica, situacao_vinculo, assistencia_estudantil, auxilios_json, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_key) DO UPDATE SET matricula=excluded.matricula, ano_ingresso=excluded.ano_ingresso,
      raca_etnia=excluded.raca_etnia, genero=excluded.genero, condicao_socioeconomica=excluded.condicao_socioeconomica,
      situacao_vinculo=excluded.situacao_vinculo, assistencia_estudantil=excluded.assistencia_estudantil,
      auxilios_json=excluded.auxilios_json, atualizado_em=excluded.atualizado_em`, row);
    await logActivity(req, 'Importação de perfis', 'Perfis de coorte importados ou atualizados.', prepared.length);
    return apiSuccess(res, { imported: prepared.length }, `${prepared.length} perfil(is) de pesquisa importado(s).`);
  } catch (error) { console.error('Erro ao importar dados de pesquisa:', error); return apiServerError(res); }
});

router.post('/surveys', async (req, res) => {
  const { anonimo, matricula, consentimento, respostas } = req.body || {};
  if (consentimento !== true) return apiBadRequest(res, 'É necessário registrar consentimento explícito para armazenar respostas de pesquisa.');
  if ((!anonimo && (typeof matricula !== 'string' || !matricula.trim() || matricula.length > 80)) || (anonimo && matricula)) return apiBadRequest(res, 'Informe matrícula para vínculo consentido ou anonimo=true.');
  const payload = cleanJson(respostas);
  if (!payload) return apiBadRequest(res, 'As respostas excedem o limite permitido ou não são JSON válido.');
  const key = anonimo ? `survey:${crypto.randomUUID()}` : `mat:${matricula.trim().toLocaleLowerCase('pt-BR')}`;
  try {
    await runSql('INSERT INTO research_survey (student_key, consent_status, respostas_json, criado_em) VALUES (?, ?, ?, ?)', [key, 'consentido', payload, new Date().toISOString()]);
    await logActivity(req, 'Registro de survey', 'Resposta de pesquisa registrada com consentimento.', 1);
    return apiCreated(res, { id: (await getSql('SELECT last_insert_rowid() AS id'))?.id }, 'Resposta armazenada com consentimento.');
  } catch (error) { console.error('Erro ao registrar survey:', error); return apiServerError(res); }
});

router.post('/entrevistas', async (req, res) => {
  const { anonimo, matricula, consentimento, status, notas } = req.body || {};
  const allowed = new Set(['planejada', 'realizada', 'transcrita', 'analisada', 'cancelada']);
  if (consentimento !== true) return apiBadRequest(res, 'É necessário registrar consentimento explícito para a entrevista.');
  if ((!anonimo && (typeof matricula !== 'string' || !matricula.trim() || matricula.length > 80)) || (anonimo && matricula)) return apiBadRequest(res, 'Informe matrícula para vínculo consentido ou anonimo=true.');
  if (!allowed.has(status || 'planejada') || (notas != null && !validText(notas, 10000))) return apiBadRequest(res, 'Situação ou notas da entrevista inválidas.');
  const key = anonimo ? `interview:${crypto.randomUUID()}` : `mat:${matricula.trim().toLocaleLowerCase('pt-BR')}`;
  const now = new Date().toISOString();
  try {
    const result = await runSql('INSERT INTO research_interviews (student_key, consent_status, status, notas_anonimas, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)', [key, 'consentido', status || 'planejada', notas?.trim() || null, now, now]);
    await logActivity(req, 'Registro de entrevista', `Entrevista registrada (${status || 'planejada'}).`, 1);
    return apiCreated(res, { id: result.lastID }, 'Entrevista registrada.');
  } catch (error) { console.error('Erro ao registrar entrevista:', error); return apiServerError(res); }
});

router.post('/modelos', async (req, res) => {
  const { nome, versao, variaveis, metricas, status } = req.body || {};
  const allowed = new Set(['experimental', 'validado', 'desativado']);
  const variables = cleanJson(variaveis, []), metrics = cleanJson(metricas, {});
  if (!validText(nome, 120) || !validText(versao, 40) || !Array.isArray(variaveis) || variaveis.length > 100 || !metricas || typeof metricas !== 'object' || Array.isArray(metricas) || !variables || !metrics || !allowed.has(status || 'experimental')) return apiBadRequest(res, 'Metadados do modelo inválidos.');
  try {
    const result = await runSql('INSERT INTO research_risk_models (model_name, version, variables_json, metrics_json, status, criado_em) VALUES (?, ?, ?, ?, ?, ?)', [nome.trim(), versao.trim(), variables, metrics, status || 'experimental', new Date().toISOString()]);
    await logActivity(req, 'Documentação de modelo', `Versão ${nome.trim()} ${versao.trim()} registrada como ${status || 'experimental'}.`, 1);
    return apiCreated(res, { id: result.lastID }, 'Versão do modelo documentada.');
  } catch (error) {
    if (/UNIQUE constraint/i.test(error.message)) return apiBadRequest(res, 'Esta versão do modelo já existe.');
    console.error('Erro ao documentar modelo:', error); return apiServerError(res);
  }
});

router.get('/exportacao', async (_req, res) => {
  try {
    const [profiles, surveys, interviews, models] = await Promise.all([
      allSql(`SELECT student_key, ano_ingresso, raca_etnia, genero, condicao_socioeconomica, situacao_vinculo, assistencia_estudantil, auxilios_json FROM research_profile ORDER BY ano_ingresso, student_key`),
      allSql(`SELECT student_key, respostas_json, criado_em FROM research_survey WHERE consent_status='consentido' ORDER BY id`),
      allSql(`SELECT student_key, status, notas_anonimas, criado_em FROM research_interviews WHERE consent_status='consentido' ORDER BY id`),
      allSql(`SELECT model_name, version, variables_json, metrics_json, status, criado_em FROM research_risk_models ORDER BY id`)
    ]);
    const deidentify = (row) => ({ ...row, participant_key: crypto.createHash('sha256').update(row.student_key).digest('hex'), student_key: undefined });
    await logActivity(_req, 'Exportação de dados', 'Exportação pseudonimizada de dados da pesquisa.', profiles.length + surveys.length + interviews.length);
    return jsonDownload(res, 'sgac-pesquisa-anonimizada.json', {
      exportedAt: new Date().toISOString(),
      profiles: profiles.map((row) => ({ ...deidentify(row), auxilios: JSON.parse(row.auxilios_json), auxilios_json: undefined })),
      surveys: surveys.map((row) => ({ ...deidentify(row), respostas: JSON.parse(row.respostas_json), respostas_json: undefined })),
      interviews: interviews.map(deidentify),
      models: models.map((row) => ({ ...row, variables: JSON.parse(row.variables_json), metrics: JSON.parse(row.metrics_json), variables_json: undefined, metrics_json: undefined }))
    });
  } catch (error) { console.error('Erro ao exportar dados de pesquisa:', error); return apiServerError(res); }
});

module.exports = router;

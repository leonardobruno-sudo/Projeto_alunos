/**
 * Papel de `research-routes.test`: garante que um comportamento importante continue funcionando nos cenários descritos a seguir.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-research-routes-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
const { db, runSql, setupDatabase } = require('../src/lib/database');
const router = require('../src/routes/research');
let server;
let base;
const users = { admin: { id: 1, username: 'admin', role: 'Admin', sessionVersion: 0 }, professor: { id: 2, username: 'prof', role: 'Professor', sessionVersion: 0 } };

async function call(route, { role = 'admin', method = 'GET', body } = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { 'x-user': role, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, payload: await response.json() };
}

test('rotas PIPAD validam escopo, consentimento e exportação sem matrícula direta', async (t) => {
  await setupDatabase();
  await runSql("INSERT INTO usuarios (id, username, password, role, session_version) VALUES (1,'admin','x','Admin',0),(2,'prof','x','Professor',0)");
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = { user: users[req.get('x-user')], destroy(callback) { callback?.(); } }; next(); });
  app.use('/api/pesquisa', router);
  server = http.createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await new Promise((resolve, reject) => db.close((err) => err ? reject(err) : resolve())); fs.rmSync(dir, { recursive: true, force: true }); });

  const denied = await call('/api/pesquisa/resumo', { role: 'professor' });
  assert.equal(denied.response.status, 403);
  const badProfile = await call('/api/pesquisa/perfis/importar', { method: 'POST', body: { records: [{ anonimo: true, matricula: 'A1', ano_ingresso: 2024 }] } });
  assert.equal(badProfile.response.status, 400);
  const imported = await call('/api/pesquisa/perfis/importar', { method: 'POST', body: { records: [{ anonimo: true, ano_ingresso: 2024, raca_etnia: 'PARDA', situacao_vinculo: 'ATIVO' }] } });
  assert.equal(imported.response.status, 200);
  const noConsent = await call('/api/pesquisa/surveys', { method: 'POST', body: { anonimo: true, respostas: { q1: 'resposta' } } });
  assert.equal(noConsent.response.status, 400);
  const consented = await call('/api/pesquisa/surveys', { method: 'POST', body: { anonimo: true, consentimento: true, respostas: { q1: 'resposta' } } });
  assert.equal(consented.response.status, 201);
  const exportResponse = await fetch(`${base}/api/pesquisa/exportacao`, { headers: { 'x-user': 'admin' } });
  assert.equal(exportResponse.status, 200);
  const output = await exportResponse.text();
  assert.equal(output.includes('matricula'), false);
  assert.equal(output.includes('participant_key'), true);
  const report = await call('/api/pesquisa/relatorio', { method: 'POST', body: {} });
  assert.equal(report.response.status, 200);
  assert.equal(report.payload.data.activity[0].operation, 'Geração de relatório Word');
  assert.equal(report.payload.data.activity.some((row) => row.operation === 'Importação de perfis'), true);
});

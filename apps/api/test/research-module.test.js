/**
 * Papel de `research-module.test`: garante que um comportamento importante continue funcionando nos cenários descritos a seguir.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sqlite3 = require('sqlite3');
const { setupResearchSchema } = require('../src/modules/research/researchSchema');

function open(file) {
  const db = new sqlite3.Database(file);
  const runSql = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
  const allSql = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
  const getSql = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
  return { db, runSql, allSql, getSql };
}

test('schema de pesquisa é aditivo, recriável e não interfere em registros acadêmicos', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-research-'));
  const store = open(path.join(dir, 'test.db'));
  t.after(async () => { await new Promise((resolve, reject) => store.db.close((err) => err ? reject(err) : resolve())); fs.rmSync(dir, { recursive: true, force: true }); });
  await store.runSql('CREATE TABLE alunos (matricula TEXT PRIMARY KEY, nome TEXT)');
  await store.runSql("INSERT INTO alunos VALUES ('A1','Aluno Um')");
  await setupResearchSchema(store.runSql);
  await setupResearchSchema(store.runSql);
  await store.runSql(`INSERT INTO research_profile (student_key, matricula, ano_ingresso, raca_etnia, situacao_vinculo, atualizado_em) VALUES ('mat:a1','A1',2024,'PARDA','ATIVO','2026-01-01')`);
  assert.equal((await store.getSql('SELECT COUNT(*) AS n FROM research_profile')).n, 1);
  assert.equal((await store.getSql('SELECT nome FROM alunos WHERE matricula=?', ['A1'])).nome, 'Aluno Um');
});

test('modelos experimentais são versionados sem permitir versão duplicada', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-research-model-'));
  const store = open(path.join(dir, 'test.db'));
  t.after(async () => { await new Promise((resolve, reject) => store.db.close((err) => err ? reject(err) : resolve())); fs.rmSync(dir, { recursive: true, force: true }); });
  await setupResearchSchema(store.runSql);
  await store.runSql("INSERT INTO research_risk_models (model_name, version, variables_json, metrics_json, status, criado_em) VALUES ('risco','0.1','[]','{}','experimental','now')");
  await assert.rejects(store.runSql("INSERT INTO research_risk_models (model_name, version, variables_json, metrics_json, status, criado_em) VALUES ('risco','0.1','[]','{}','experimental','now')"), /UNIQUE constraint/);
});

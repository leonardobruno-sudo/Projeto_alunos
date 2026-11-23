/**
 * Papel de `academic-life-schema-migration.test`: garante que um comportamento importante continue funcionando nos cenários descritos a seguir.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/** Confere a atualização de uma tabela de Vida Acadêmica que já existia. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sqlite3 = require('sqlite3');

const { setupAcademicLifeSchema } = require('../src/modules/academic-life/academicLifeSchema');

function openDatabase(filePath) {
  const database = new sqlite3.Database(filePath);
  return {
    allSql(sql) {
      return new Promise((resolve, reject) => {
        database.all(sql, (error, rows) => (error ? reject(error) : resolve(rows || [])));
      });
    },
    close() {
      return new Promise((resolve, reject) => database.close((error) => (error ? reject(error) : resolve())));
    },
    runSql(sql) {
      return new Promise((resolve, reject) => {
        database.run(sql, (error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

test('migração da Vida Acadêmica acrescenta período aos requerimentos já existentes', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-academic-schema-'));
  const database = openDatabase(path.join(directory, 'escola.db'));
  t.after(async () => {
    await database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await database.runSql('CREATE TABLE usuarios (id INTEGER PRIMARY KEY)');
  await database.runSql('CREATE TABLE alunos (matricula TEXT PRIMARY KEY)');
  await database.runSql(`CREATE TABLE requerimentos_academicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula TEXT NOT NULL,
    tipo TEXT NOT NULL,
    descricao TEXT,
    status TEXT NOT NULL DEFAULT 'ABERTO',
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL,
    atualizado_por INTEGER
  )`);

  await setupAcademicLifeSchema(database.runSql, database.allSql);
  await setupAcademicLifeSchema(database.runSql, database.allSql);

  const columns = await database.allSql('PRAGMA table_info(requerimentos_academicos)');
  assert.ok(columns.some((column) => column.name === 'periodo'));
});

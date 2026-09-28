/**
 * Regression coverage for the separation between a closed period bulletin
 * and a live enrollment. These tests exercise the protected routes so the
 * validation and teacher-only update paths stay covered together.
 */
'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-subject-update-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'escola.db');

const {
  db,
  getSql,
  runSql,
  setupDatabase,
  saveAcademicHistoryPeriod,
  updateStudentFields
} = require('../src/lib/database');
const apiRoutes = require('../src/routes/api');

const actors = new Map();
let server;
let baseUrl;

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

async function createActor(key, values) {
  const result = await runSql(
    `INSERT INTO usuarios (username, password, role, nome, curso, disciplina, turma)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      values.username,
      'test-password-hash',
      values.role,
      values.nome,
      values.curso || null,
      values.disciplina || null,
      values.turma || null
    ]
  );
  actors.set(key, { id: result.lastID, sessionVersion: 0 });
}

async function insertStudent({ matricula, subjects, totalAulas = 100 }) {
  await runSql(
    `INSERT INTO alunos (
      matricula, nome, curso, disciplina, turma, nota_final, taxa_faltas,
      faltas_justificadas, total_aulas, materias_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      matricula,
      `Aluno ${matricula}`,
      'Curso de teste',
      'Matemática',
      'Turma A',
      80,
      10,
      0,
      totalAulas,
      JSON.stringify(subjects)
    ]
  );
}

async function requestApi(url, { actor = 'admin', method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      'x-test-actor': actor,
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, payload: await response.json() };
}

async function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor = actors.get(req.get('x-test-actor') || 'admin');
    req.session = {
      user: actor ? { ...actor } : {},
      destroy(callback) {
        if (typeof callback === 'function') callback();
      }
    };
    next();
  });
  app.use('/api', apiRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function closeTestServer() {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
}

test('regressões de atualização de matérias e boletim', async (t) => {
  await setupDatabase();
  await createActor('admin', {
    username: 'admin-history-test',
    role: 'Admin',
    nome: 'Admin de teste'
  });
  await createActor('professor', {
    username: 'professor-history-test',
    role: 'Professor',
    nome: 'Professor de teste',
    curso: 'Curso de teste',
    disciplina: 'Matemática',
    turma: 'Turma A'
  });
  await startTestServer();

  t.after(async () => {
    await closeTestServer();
    await closeDatabase();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await t.test('boletim fechado mantém 100 aulas e fonte atual mostra 80 aulas', async () => {
    const matricula = 'HIST-001';
    await insertStudent({
      matricula,
      subjects: [
        { name: 'Matemática', nota: 80, faltas: 10, faltas_justificadas: 0, total_aulas: 100 }
      ]
    });
    await saveAcademicHistoryPeriod(0, 'admin-history-test');

    await updateStudentFields(matricula, {
      total_aulas: 80,
      materias_json: JSON.stringify([
        { name: 'Matemática', nota: 80, faltas: 10, faltas_justificadas: 0, total_aulas: 80 }
      ])
    });

    const historical = await requestApi(`/api/alunos/${matricula}?periodo=0`);
    assert.equal(historical.response.status, 200);
    assert.equal(historical.payload.data.dataSource, 'historico');
    assert.equal(historical.payload.data.hasPeriodSnapshot, true);
    assert.equal(historical.payload.data.aluno.subjects[0].total_aulas, 100);
    assert.equal(historical.payload.data.aluno.subjects[0].percentual_faltas, 10);

    const live = await requestApi(`/api/alunos/${matricula}?periodo=0&fonte=atual`);
    assert.equal(live.response.status, 200);
    assert.equal(live.payload.data.dataSource, 'atual');
    assert.equal(live.payload.data.hasPeriodSnapshot, true);
    assert.equal(live.payload.data.aluno.subjects[0].total_aulas, 80);
    assert.equal(live.payload.data.aluno.subjects[0].percentual_faltas, 12.5);

    const liveList = await requestApi(
      `/api/alunos?periodo=0&fonte=atual&busca_matricula=${encodeURIComponent(matricula)}`
    );
    assert.equal(liveList.response.status, 200);
    assert.equal(liveList.payload.data.dataSource, 'atual');
    assert.equal(liveList.payload.data.hasPeriodSnapshot, true);
    assert.equal(liveList.payload.data.alunos[0].taxa_faltas, 12.5);

    const liveSubject = await requestApi(
      `/api/materia/0?periodo=0&fonte=atual&busca_matricula=${encodeURIComponent(matricula)}`
    );
    assert.equal(liveSubject.response.status, 200);
    assert.equal(liveSubject.payload.data.dataSource, 'atual');
    assert.equal(liveSubject.payload.data.hasPeriodSnapshot, true);
    assert.match(liveSubject.payload.data.snapshotAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(liveSubject.payload.data.students[0].total_aulas, 80);
  });

  await t.test('catálogo de matérias da turma usa o cadastro atual, não o snapshot fechado', async () => {
    const matricula = 'CATALOG-001';
    await insertStudent({
      matricula,
      subjects: [
        { name: 'Disciplina histórica exclusiva', nota: 80, faltas: 0, faltas_justificadas: 0, total_aulas: 100 }
      ]
    });
    await saveAcademicHistoryPeriod(0, 'admin-history-test', { overwrite: true });
    await updateStudentFields(matricula, {
      materias_json: JSON.stringify([
        { name: 'Disciplina atual exclusiva', nota: 80, faltas: 0, faltas_justificadas: 0, total_aulas: 80 }
      ])
    });

    const catalog = await requestApi(`/api/turma-materias?turma=${encodeURIComponent('Turma A')}`);
    assert.equal(catalog.response.status, 200);
    assert.ok(catalog.payload.data.includes('Disciplina atual exclusiva'));
    assert.equal(catalog.payload.data.includes('Disciplina histórica exclusiva'), false);
  });

  await t.test('cadastro rejeita faltas acima das aulas ou justificadas acima das faltas', async () => {
    const matricula = 'VALID-001';
    await insertStudent({
      matricula,
      subjects: [
        { name: 'Matemática', nota: 75, faltas: 2, faltas_justificadas: 0, total_aulas: 100 }
      ]
    });

    const aboveWorkload = await requestApi(`/api/alunos/${matricula}`, {
      method: 'PATCH',
      body: {
        subjects: [
          { name: 'Matemática', nota: 75, faltas: 101, faltas_justificadas: 0, total_aulas: 100 }
        ]
      }
    });
    assert.equal(aboveWorkload.response.status, 400);
    assert.equal(aboveWorkload.payload.success, false);

    const aboveAbsences = await requestApi(`/api/alunos/${matricula}`, {
      method: 'PATCH',
      body: {
        subjects: [
          { name: 'Matemática', nota: 75, faltas: 5, faltas_justificadas: 6, total_aulas: 100 }
        ]
      }
    });
    assert.equal(aboveAbsences.response.status, 400);
    assert.equal(aboveAbsences.payload.success, false);

    const stored = await getSql('SELECT materias_json FROM alunos WHERE matricula = ?', [matricula]);
    assert.equal(JSON.parse(stored.materias_json)[0].faltas, 2);
  });

  await t.test('edição de uma matéria pelo professor preserva o denominador de carga horária legada', async () => {
    const matricula = 'LEGACY-001';
    await insertStudent({
      matricula,
      totalAulas: 100,
      subjects: [
        { name: 'Matemática', nota: 80, faltas: 4, faltas_justificadas: 0, total_aulas: 100 },
        { name: 'História', nota: 70, faltas: 3, faltas_justificadas: 0, total_aulas: 100 }
      ]
    });

    const update = await requestApi(`/api/alunos/${matricula}/materias/Matemática`, {
      actor: 'professor',
      method: 'PATCH',
      body: {
        nota: 82,
        faltas: 6,
        faltas_justificadas: 1,
        total_aulas: 80
      }
    });
    assert.equal(update.response.status, 200);
    assert.equal(update.payload.success, true);
    assert.equal(
      update.payload.data.aluno.subjects.find((subject) => subject.name === 'Matemática').total_aulas,
      80
    );

    const stored = await getSql(
      'SELECT total_aulas, materias_json FROM alunos WHERE matricula = ?',
      [matricula]
    );
    const subjects = JSON.parse(stored.materias_json);
    assert.equal(stored.total_aulas, 100);
    assert.equal(subjects.find((subject) => subject.name === 'Matemática').total_aulas, 80);
    assert.equal(subjects.find((subject) => subject.name === 'História').total_aulas, 100);

    const movement = await requestApi(`/api/alunos/${matricula}/movimentacao`, {
      method: 'PATCH',
      body: { turma: 'Turma B' }
    });
    assert.equal(movement.response.status, 200);
    assert.equal(movement.payload.data.aluno.turma, 'Turma B');
  });
});

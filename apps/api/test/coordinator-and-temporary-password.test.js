/**
 * Papel de `coordinator-and-temporary-password.test`: garante que um comportamento importante continue funcionando nos cenários descritos a seguir.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Confere a segurança do perfil Coordenador limitado ao curso e das
 * credenciais temporárias aleatórias dos alunos. Usa um SQLite isolado para não
 * tocar em cadastros nem senhas do ambiente de desenvolvimento.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-coordinator-password-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'escola.db');

const {
  db,
  getSql,
  runSql,
  setupDatabase,
  fetchVisibleStudents,
  createStudentWithAccount,
  resetStudentTemporaryPassword,
  deleteStaffUserById
} = require('../src/lib/database');
const { authenticateUser, changePassword } = require('../src/lib/auth');
const academicLife = require('../src/modules/academic-life/academicLife.service');
const { ensureAuth } = require('../src/lib/helpers');
const {
  canAccessStudent,
  canEditStudent,
  canRegisterStudents,
  canDeleteStudents
} = require('../src/lib/permissions');
const { getInitialStudentPassword, hashPassword, verifyPassword } = require('../src/lib/utils');

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

async function invokeEnsureAuth({ user, originalUrl, method = 'GET' }) {
  let nextCalled = false;
  let response = null;
  const req = {
    originalUrl,
    method,
    session: { user, destroy: () => {} }
  };
  const res = {
    status(statusCode) {
      response = { statusCode };
      return this;
    },
    json(body) {
      response = { ...response, body };
      return this;
    }
  };
  await ensureAuth(req, res, () => { nextCalled = true; });
  return { nextCalled, response, user: req.session.user };
}

async function createStudent(matricula, nome, curso) {
  return createStudentWithAccount({
    matricula,
    nome,
    curso,
    disciplina: 'Matemática',
    turma: '1A',
    materias_json: JSON.stringify([
      { name: 'Matemática', nota: 80, faltas: 1, faltas_justificadas: 0, total_aulas: 100 }
    ])
  });
}

test('Coordenador permanece no curso e credenciais de aluno são temporárias e obrigatórias', async (t) => {
  t.after(async () => {
    await closeDatabase();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await setupDatabase();

  await t.test('novas credenciais são aleatórias, hasheadas e exigem troca', async () => {
    const firstAccount = await createStudent('TADS-001', 'Ana TADS', 'TADS');
    const secondAccount = await createStudent('TADS-002', 'Bruno TADS', 'TADS');

    assert.equal(firstAccount.created, true);
    assert.equal(firstAccount.mustChangePassword, true);
    assert.match(firstAccount.temporaryPassword, /^SGAC-[0-9a-f]{36}$/);
    assert.notEqual(firstAccount.temporaryPassword, secondAccount.temporaryPassword);
    assert.notEqual(firstAccount.temporaryPassword, getInitialStudentPassword('TADS-001', 'Ana TADS'));

    const stored = await getSql(
      'SELECT id, password, must_change_password, session_version FROM usuarios WHERE matricula = ?',
      ['TADS-001']
    );
    assert.ok(stored);
    assert.equal(stored.must_change_password, 1);
    assert.ok(verifyPassword(firstAccount.temporaryPassword, stored.password));
    assert.equal(stored.password.includes(firstAccount.temporaryPassword), false);

    const signedIn = await authenticateUser('tads-001', firstAccount.temporaryPassword);
    assert.equal(signedIn.mustChangePassword, true);

    const blocked = await invokeEnsureAuth({
      user: signedIn,
      originalUrl: '/api/alunos',
      method: 'GET'
    });
    assert.equal(blocked.nextCalled, false);
    assert.equal(blocked.response.statusCode, 403);
    assert.equal(blocked.response.body.error.code, 'password_change_required');

    const passwordScreen = await invokeEnsureAuth({
      user: signedIn,
      originalUrl: '/api/auth/password',
      method: 'POST'
    });
    assert.equal(passwordScreen.nextCalled, true);
    assert.equal(passwordScreen.user.mustChangePassword, true);

    const changed = await changePassword(
      signedIn.id,
      firstAccount.temporaryPassword,
      'SenhaNova!123'
    );
    assert.equal(changed.mustChangePassword, false);

    const afterChange = await getSql(
      'SELECT password, must_change_password, session_version FROM usuarios WHERE id = ?',
      [stored.id]
    );
    assert.equal(afterChange.must_change_password, 0);
    assert.ok(verifyPassword('SenhaNova!123', afterChange.password));
    assert.ok(afterChange.session_version > stored.session_version);

    const reset = await resetStudentTemporaryPassword('TADS-001');
    assert.ok(reset);
    assert.equal(reset.mustChangePassword, true);
    assert.match(reset.temporaryPassword, /^SGAC-[0-9a-f]{36}$/);
    assert.notEqual(reset.temporaryPassword, firstAccount.temporaryPassword);

    const afterReset = await getSql(
      'SELECT password, must_change_password, session_version FROM usuarios WHERE id = ?',
      [stored.id]
    );
    assert.equal(afterReset.must_change_password, 1);
    assert.equal(verifyPassword('SenhaNova!123', afterReset.password), false);
    assert.ok(verifyPassword(reset.temporaryPassword, afterReset.password));
    assert.ok(afterReset.session_version > afterChange.session_version);
  });

  await t.test('contas legadas previsíveis continuam acessíveis apenas para trocar a senha', async () => {
    await runSql(
      `INSERT INTO alunos (matricula, nome, curso, disciplina, turma)
       VALUES (?, ?, ?, ?, ?)`,
      ['LEGADO-001', 'Carla Legado', 'TADS', 'Matemática', '1A']
    );
    const legacyPassword = getInitialStudentPassword('LEGADO-001', 'Carla Legado');
    await runSql(
      `INSERT INTO usuarios (username, password, role, matricula, nome, curso, disciplina, turma, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['LEGADO-001', hashPassword(legacyPassword), 'Aluno', 'LEGADO-001', 'Carla Legado', 'TADS', 'Matemática', '1A', 0]
    );

    // Executar a migração outra vez simula a atualização de uma instalação SQLite
    // já existente. A senha antiga conhecida deve ser preservada, mas
    // a próxima ação autenticada deve exigir que ela seja trocada.
    await setupDatabase();
    const stored = await getSql(
      'SELECT id, password, must_change_password FROM usuarios WHERE matricula = ?',
      ['LEGADO-001']
    );
    assert.equal(stored.must_change_password, 1);
    assert.ok(verifyPassword(legacyPassword, stored.password));

    const signedIn = await authenticateUser('legado-001', legacyPassword);
    assert.equal(signedIn.mustChangePassword, true);
    const changed = await changePassword(signedIn.id, legacyPassword, 'SenhaMigrada!123');
    assert.equal(changed.mustChangePassword, false);
  });

  await t.test('backfill não cria senha aleatória perdida e a redefinição provisiona a conta pendente', async () => {
    await runSql(
      `INSERT INTO alunos (matricula, nome, curso, disciplina, turma)
       VALUES (?, ?, ?, ?, ?)`,
      ['PENDENTE-001', 'Erica Pendente', 'TADS', 'Matemática', '1A']
    );

    await setupDatabase();
    assert.equal(
      await getSql('SELECT id FROM usuarios WHERE role = ? AND matricula = ?', ['Aluno', 'PENDENTE-001']),
      undefined
    );

    const provisioned = await resetStudentTemporaryPassword('PENDENTE-001');
    assert.ok(provisioned);
    assert.equal(provisioned.created, true);
    assert.match(provisioned.temporaryPassword, /^SGAC-[0-9a-f]{36}$/);

    const account = await getSql(
      'SELECT password, must_change_password FROM usuarios WHERE role = ? AND matricula = ?',
      ['Aluno', 'PENDENTE-001']
    );
    assert.ok(account);
    assert.equal(account.must_change_password, 1);
    assert.ok(verifyPassword(provisioned.temporaryPassword, account.password));
  });

  await t.test('Coordenador vê e edita somente o próprio curso sem ganhar ciclo de matrícula', async () => {
    await createStudent('REDES-001', 'Davi Redes', 'Redes');

    const coordinator = { role: 'Coordenador', curso: 'TADS' };
    const tadsStudent = await getSql('SELECT * FROM alunos WHERE matricula = ?', ['TADS-001']);
    const redesStudent = await getSql('SELECT * FROM alunos WHERE matricula = ?', ['REDES-001']);
    assert.equal(canAccessStudent(coordinator, tadsStudent), true);
    assert.equal(canEditStudent(coordinator, tadsStudent), true);
    assert.equal(canAccessStudent(coordinator, redesStudent), false);
    assert.equal(canEditStudent(coordinator, redesStudent), false);
    assert.equal(canRegisterStudents(coordinator), false);
    assert.equal(canDeleteStudents(coordinator), false);

    const visible = await fetchVisibleStudents({
      query: { fonte: 'atual' },
      session: { user: coordinator }
    });
    assert.ok(visible.alunos.length >= 3);
    assert.ok(visible.alunos.every((student) => student.curso === 'TADS'));
    assert.equal(visible.alunos.some((student) => student.matricula === 'REDES-001'), false);
  });

  await t.test('Coordenador não recebe requerimentos ou documentos de outro curso', async () => {
    const adminResult = await runSql(
      `INSERT INTO usuarios (username, password, role, nome)
       VALUES (?, ?, ?, ?)`,
      ['admin-registros-coordenador', 'hash', 'Admin', 'Admin Registros']
    );
    const admin = { id: adminResult.lastID, role: 'Admin' };
    const coordinator = { id: 999, role: 'Coordenador', curso: 'TADS' };

    await academicLife.createRequest(admin, { matricula: 'TADS-001', tipo: 'DECLARACAO' });
    await academicLife.createRequest(admin, { matricula: 'REDES-001', tipo: 'DECLARACAO' });
    await academicLife.createDocument(admin, { matricula: 'TADS-001', tipo: 'BOLETIM', titulo: 'Boletim TADS' });
    await academicLife.createDocument(admin, { matricula: 'REDES-001', tipo: 'BOLETIM', titulo: 'Boletim Redes' });

    const [requests, documents] = await Promise.all([
      academicLife.listRequests(coordinator),
      academicLife.listDocuments(coordinator)
    ]);
    assert.deepEqual(requests.map((item) => item.matricula), ['TADS-001']);
    assert.deepEqual(documents.map((item) => item.matricula), ['TADS-001']);
  });

  await t.test('Coordenador registra requerimento apenas para aluno do próprio curso', async () => {
    const inserted = await runSql(
      `INSERT INTO usuarios (username, password, role, nome, curso)
       VALUES (?, ?, ?, ?, ?)`,
      ['coordenador-requerimentos', 'hash', 'Coordenador', 'Coordenação TADS', 'TADS']
    );
    const coordinator = { id: inserted.lastID, role: 'Coordenador', curso: 'TADS' };

    const ownRequest = await academicLife.createRequest(coordinator, {
      matricula: 'TADS-001',
      tipo: 'DECLARACAO'
    });
    assert.equal(ownRequest.matricula, 'TADS-001');
    await assert.rejects(
      () => academicLife.createRequest(coordinator, { matricula: 'REDES-001', tipo: 'DECLARACAO' }),
      (error) => error instanceof academicLife.AcademicLifeError && error.statusCode === 403
    );
  });

  await t.test('conta de Coordenador pode ser revogada como demais contas de equipe', async () => {
    const inserted = await runSql(
      `INSERT INTO usuarios (username, password, role, nome, curso)
       VALUES (?, ?, ?, ?, ?)`,
      ['coordenador-removivel', 'hash', 'Coordenador', 'Coordenador removível', 'TADS']
    );
    await runSql(
      'INSERT INTO sessoes (sid, sess, expires) VALUES (?, ?, ?)',
      ['sessao-coordenador', JSON.stringify({ user: { id: inserted.lastID } }), Date.now() + 60_000]
    );

    const deleted = await deleteStaffUserById(inserted.lastID);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.user.role, 'Coordenador');
    assert.equal(deleted.deletedSessions, 1);
    assert.equal(await getSql('SELECT id FROM usuarios WHERE id = ?', [inserted.lastID]), undefined);
    assert.equal(await getSql('SELECT sid FROM sessoes WHERE sid = ?', ['sessao-coordenador']), undefined);
  });
});

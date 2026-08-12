/**
 * Isolated SQLite checks for orphan student-account cleanup. The test uses a
 * temporary database so it never reads or changes the application's data.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-account-cleanup-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'escola.db');

const {
  db,
  getSql,
  runSql,
  setupDatabase,
  createStudentWithAccount
} = require('../src/lib/database');
const { getInitialStudentPassword, verifyPassword } = require('../src/lib/utils');

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

async function insertStudent(matricula, nome) {
  await runSql(
    'INSERT INTO alunos (matricula, nome) VALUES (?, ?)',
    [matricula, nome]
  );
}

async function insertUser({ username, role, matricula = null, nome = '' }) {
  const result = await runSql(
    `INSERT INTO usuarios (username, password, role, matricula, nome)
     VALUES (?, ?, ?, ?, ?)`,
    [username, 'hash-de-teste', role, matricula, nome]
  );
  return result.lastID;
}

async function insertSession(sid, userId) {
  await runSql(
    'INSERT INTO sessoes (sid, sess, expires) VALUES (?, ?, ?)',
    [sid, JSON.stringify({ user: { id: userId } }), Date.now() + 60_000]
  );
}

test('limpeza de contas de aluno órfãs', async (t) => {
  t.after(async () => {
    await closeDatabase();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await setupDatabase();

  await t.test('a inicialização remove órfãs, sessões vinculadas e preserva equipe e histórico', async () => {
    await insertStudent('ATIVO-01', 'Aluno Ativo');
    const activeStudentAccount = await insertUser({
      username: 'ATIVO-01',
      role: 'Aluno',
      matricula: 'ativo-01',
      nome: 'Aluno Ativo'
    });
    const orphanStudentAccount = await insertUser({
      username: 'ORFA-01',
      role: 'Aluno',
      matricula: 'ORFA-01',
      nome: 'Conta Antiga'
    });
    const adminAccount = await insertUser({ username: 'admin-teste', role: 'Admin', matricula: 'ORFA-ADMIN' });
    const directorAccount = await insertUser({ username: 'diretor-teste', role: 'Diretor', matricula: 'ORFA-DIRETOR' });
    const teacherAccount = await insertUser({ username: 'professor-teste', role: 'Professor', matricula: 'ORFA-PROFESSOR' });

    await insertSession('sessao-orfa', orphanStudentAccount);
    await insertSession('sessao-admin', adminAccount);
    await runSql(
      `INSERT INTO historico_academico (matricula, periodo, snapshot_json, salvo_em)
       VALUES (?, ?, ?, ?)`,
      ['ORFA-01', 0, '{"periodIndex":0,"student":{"matricula":"ORFA-01"}}', new Date().toISOString()]
    );

    // Calling setup again exercises the automatic startup path, not only the
    // exported maintenance helper.
    await setupDatabase();

    assert.ok(await getSql('SELECT id FROM usuarios WHERE id = ?', [activeStudentAccount]));
    assert.equal(await getSql('SELECT id FROM usuarios WHERE id = ?', [orphanStudentAccount]), undefined);
    assert.equal(await getSql('SELECT sid FROM sessoes WHERE sid = ?', ['sessao-orfa']), undefined);
    assert.ok(await getSql('SELECT sid FROM sessoes WHERE sid = ?', ['sessao-admin']));
    assert.ok(await getSql('SELECT id FROM usuarios WHERE id = ?', [adminAccount]));
    assert.ok(await getSql('SELECT id FROM usuarios WHERE id = ?', [directorAccount]));
    assert.ok(await getSql('SELECT id FROM usuarios WHERE id = ?', [teacherAccount]));
    assert.ok(await getSql('SELECT matricula FROM historico_academico WHERE matricula = ?', ['ORFA-01']));
  });

  await t.test('novo cadastro reutiliza matrícula e usuário de uma conta órfã com segurança', async () => {
    const obsoleteAccount = await insertUser({
      username: 'REUSO-01',
      role: 'Aluno',
      matricula: 'REUSO-01',
      nome: 'Cadastro Antigo'
    });
    await insertSession('sessao-reuso', obsoleteAccount);
    await runSql(
      `INSERT INTO historico_academico (matricula, periodo, snapshot_json, salvo_em)
       VALUES (?, ?, ?, ?)`,
      ['REUSO-01', 1, '{"periodIndex":1,"student":{"matricula":"REUSO-01"}}', new Date().toISOString()]
    );

    await createStudentWithAccount({
      matricula: 'reuso-01',
      nome: 'Novo Aluno',
      turma: 'TURMA-TESTE',
      curso: 'Curso de teste',
      disciplina: 'Disciplina de teste'
    });

    const replacementAccount = await getSql(
      'SELECT id, username, matricula, nome, password FROM usuarios WHERE lower(trim(username)) = ?',
      ['reuso-01']
    );
    assert.ok(replacementAccount);
    assert.notEqual(replacementAccount.id, obsoleteAccount);
    assert.equal(replacementAccount.matricula, 'REUSO-01');
    assert.equal(replacementAccount.nome, 'Novo Aluno');
    assert.ok(verifyPassword(getInitialStudentPassword('REUSO-01', 'Novo Aluno'), replacementAccount.password));
    assert.equal(await getSql('SELECT id FROM usuarios WHERE id = ?', [obsoleteAccount]), undefined);
    assert.equal(await getSql('SELECT sid FROM sessoes WHERE sid = ?', ['sessao-reuso']), undefined);
    assert.ok(await getSql('SELECT matricula FROM historico_academico WHERE matricula = ? AND periodo = ?', ['REUSO-01', 1]));
  });
});

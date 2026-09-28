/**
 * Authorization regression tests for staff roles. They use an isolated
 * database and make sure a professor only receives their assigned subject.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-role-permissions-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'escola.db');

const {
  db,
  runSql,
  getSql,
  setupDatabase,
  fetchVisibleStudents,
  getVisibleStudentByMatricula,
  deleteStaffUserById
} = require('../src/lib/database');
const {
  canAccessStudent,
  canRegisterStudents,
  canDeleteStudents,
  canExportCsv,
  canEditOwnSubject
} = require('../src/lib/permissions');

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

test.after(async () => {
  await closeDatabase();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function insertStudent({ matricula, disciplina, subjects }) {
  await runSql(
    `INSERT INTO alunos (matricula, nome, curso, disciplina, turma, materias_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [matricula, `Aluno ${matricula}`, 'TADS', disciplina, '1A', JSON.stringify(subjects)]
  );
}

test('professor recebe e consulta somente a matéria atribuída, mesmo se o campo geral do aluno divergir', async () => {
  await setupDatabase();
  await insertStudent({
    matricula: 'BIO-001',
    disciplina: 'Física',
    subjects: [
      { name: 'Biologia', nota: 82, faltas: 2, faltas_justificadas: 0, total_aulas: 100 },
      { name: 'Matemática', nota: 91, faltas: 1, faltas_justificadas: 0, total_aulas: 100 }
    ]
  });
  await insertStudent({
    matricula: 'MAT-001',
    disciplina: 'Matemática',
    subjects: [
      { name: 'Matemática', nota: 75, faltas: 3, faltas_justificadas: 0, total_aulas: 100 }
    ]
  });

  const professor = {
    id: 10,
    role: 'Professor',
    curso: 'TADS',
    disciplina: 'Biologia',
    turma: '1A'
  };
  const data = await fetchVisibleStudents({ query: {}, session: { user: professor } });

  assert.equal(data.alunos.length, 1);
  assert.deepEqual(data.subjectNames, ['Biologia']);
  assert.equal(data.alunos[0].matricula, 'BIO-001');
  assert.deepEqual(data.alunos[0].subjects.map((subject) => subject.name), ['Biologia']);
  assert.equal(data.alunos[0].nota_final, 82);
  assert.equal(data.alunos[0].taxa_faltas, 2);
  assert.equal('materias_json' in data.alunos[0], false);
  assert.equal('materia2' in data.alunos[0], false);

  const matchingName = await fetchVisibleStudents({
    query: { busca_nome: 'bio-001' },
    session: { user: professor }
  });
  assert.equal(matchingName.alunos.length, 1);
  assert.equal(matchingName.alunos[0].matricula, 'BIO-001');

  const outsideName = await fetchVisibleStudents({
    query: { busca_nome: 'mat-001' },
    session: { user: professor }
  });
  assert.equal(outsideName.alunos.length, 0);

  const rawStudent = await getSql('SELECT * FROM alunos WHERE matricula = ?', ['BIO-001']);
  assert.equal(canAccessStudent(professor, rawStudent), true);
  const visibleStudent = await getVisibleStudentByMatricula(professor, 'BIO-001');
  assert.deepEqual(visibleStudent.subjects.map((subject) => subject.name), ['Biologia']);
  assert.equal(await getVisibleStudentByMatricula(professor, 'MAT-001'), null);
});

test('aluno consulta todas as próprias matérias e não acessa outro boletim', async () => {
  await setupDatabase();
  await insertStudent({
    matricula: 'BOLETIM-001',
    disciplina: 'História',
    subjects: [
      { name: 'História', nota: 84, faltas: 3, faltas_justificadas: 1, total_aulas: 100 },
      { name: 'Matemática', nota: 72, faltas: 8, faltas_justificadas: 0, total_aulas: 100 }
    ]
  });
  await insertStudent({
    matricula: 'BOLETIM-002',
    disciplina: 'História',
    subjects: [
      { name: 'História', nota: 90, faltas: 1, faltas_justificadas: 0, total_aulas: 100 }
    ]
  });

  const aluno = { role: 'Aluno', matricula: 'BOLETIM-001' };
  const ownBulletin = await getVisibleStudentByMatricula(aluno, 'BOLETIM-001');

  assert.ok(ownBulletin);
  assert.deepEqual(ownBulletin.subjects.map((subject) => subject.name), ['História', 'Matemática']);
  assert.equal(ownBulletin.subjects[0].percentual_faltas, 2);
  assert.equal(await getVisibleStudentByMatricula(aluno, 'BOLETIM-002'), null);
});

test('capacidades de cadastro e CSV não são concedidas ao professor', () => {
  const professor = { role: 'Professor', disciplina: 'Biologia' };
  const diretor = { role: 'Diretor' };
  const admin = { role: 'Admin' };

  assert.equal(canEditOwnSubject(professor), true);
  assert.equal(canRegisterStudents(professor), false);
  assert.equal(canDeleteStudents(professor), false);
  assert.equal(canExportCsv(professor), false);
  assert.equal(canRegisterStudents(diretor), true);
  assert.equal(canExportCsv(diretor), false);
  assert.equal(canExportCsv(admin), true);
});

test('a exclusão de Professor ou Diretor revoga também as sessões da conta', async () => {
  const professorResult = await runSql(
    `INSERT INTO usuarios (username, password, role, nome, curso, disciplina, turma)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['professor-removivel', 'hash', 'Professor', 'Professor removível', 'TADS', 'Biologia', '1A']
  );
  const adminResult = await runSql(
    `INSERT INTO usuarios (username, password, role, nome)
     VALUES (?, ?, ?, ?)`,
    ['admin-protegido', 'hash', 'Admin', 'Admin protegido']
  );
  await runSql(
    'INSERT INTO sessoes (sid, sess, expires) VALUES (?, ?, ?)',
    ['sessao-professor', JSON.stringify({ user: { id: professorResult.lastID } }), Date.now() + 60_000]
  );

  const deleted = await deleteStaffUserById(professorResult.lastID);
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.deletedSessions, 1);
  assert.equal(await getSql('SELECT id FROM usuarios WHERE id = ?', [professorResult.lastID]), undefined);
  assert.equal(await getSql('SELECT sid FROM sessoes WHERE sid = ?', ['sessao-professor']), undefined);

  const protectedAdmin = await deleteStaffUserById(adminResult.lastID);
  assert.equal(protectedAdmin.deleted, false);
  assert.equal(protectedAdmin.reason, 'protected');
  assert.ok(await getSql('SELECT id FROM usuarios WHERE id = ?', [adminResult.lastID]));
});

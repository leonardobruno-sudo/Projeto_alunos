/**
 * Regression coverage for the compact student-list DTO used by the Matérias
 * page. It runs against an isolated SQLite file and never touches real data.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-subject-catalog-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'escola.db');

const { db, runSql, setupDatabase } = require('../src/lib/database');
const { listStudents, toStudentListItemDto } = require('../src/modules/students/student.service');

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

async function insertStudent({ matricula, nome, subjects }) {
  await runSql(
    `INSERT INTO alunos (matricula, nome, curso, disciplina, turma, materias_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [matricula, nome, 'Curso de teste', 'Disciplina de teste', 'Turma A', JSON.stringify(subjects)]
  );
}

test('a lista paginada mantém catálogo de matérias de todo o resultado autorizado', async (t) => {
  t.after(async () => {
    await closeDatabase();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await setupDatabase();
  await insertStudent({
    matricula: 'A-001',
    nome: 'Ana',
    subjects: [
      { name: 'Matemática', nota: 80, faltas: 2, faltas_justificadas: 0, total_aulas: 100 },
      { name: 'História', nota: 75, faltas: 1, faltas_justificadas: 0, total_aulas: 100 }
    ]
  });
  await insertStudent({
    matricula: 'B-001',
    nome: 'Bruno',
    subjects: [
      { name: 'Português', nota: 70, faltas: 4, faltas_justificadas: 0, total_aulas: 100 }
    ]
  });

  const data = await listStudents(
    { session: { user: { id: 1, role: 'Admin' } } },
    { periodo: 0, page: 1, pageSize: 1, sort: 'nome', direction: 'asc' }
  );

  assert.equal(data.alunos.length, 1);
  assert.equal(data.alunos[0].matricula, 'A-001');
  assert.equal('subjects' in data.alunos[0], false);
  assert.equal('materias_json' in data.alunos[0], false);
  assert.deepEqual(data.subjectNames, ['Matemática', 'História', 'Português']);
});

test('o DTO compacto preserva os indicadores individuais de risco acadêmico', () => {
  const item = toStudentListItemDto({
    matricula: 'R-001',
    nome: 'Registro em risco',
    nota_final: 62,
    taxa_faltas: 28,
    risco_nota: true,
    risco_faltas: true,
    situacao_risco: 'Em Risco'
  });

  assert.equal(item.risco_nota, true);
  assert.equal(item.risco_faltas, true);
  assert.equal(item.nota_final, 62);
  assert.equal(item.taxa_faltas, 28);
});

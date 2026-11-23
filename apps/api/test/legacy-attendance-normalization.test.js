/**
 * Papel de `legacy-attendance-normalization.test`: garante que um comportamento importante continue funcionando nos cenários descritos a seguir.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/** Confere a correção de registros antigos ou gerados de frequência. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-attendance-normalization-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'escola.db');

const {
  db,
  getSql,
  runSql,
  setupDatabase,
  normalizeLegacyAcademicAttendanceData
} = require('../src/lib/database');

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

test('normaliza faltas legadas e snapshots sem perder ausências justificadas', async (t) => {
  t.after(async () => {
    await closeDatabase();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await setupDatabase();

  const subjects = [
    { name: 'Matéria A', nota: 80, faltas: 0, faltas_justificadas: 2, total_aulas: 100 },
    { name: 'Matéria B', nota: 75, faltas: 3, faltas_justificadas: 4, total_aulas: 100 },
    { name: 'Matéria C', nota: 90, faltas: 105, faltas_justificadas: 4, total_aulas: 100 }
  ];
  const student = {
    matricula: 'LEGADO-001',
    nome: 'Aluno legado',
    nota_final: 81.7,
    taxa_faltas: 1,
    faltas_justificadas: 10,
    total_aulas: 100,
    materias_json: JSON.stringify(subjects)
  };

  await runSql(
    `INSERT INTO alunos (
      matricula, nome, nota_final, taxa_faltas, faltas_justificadas, total_aulas, materias_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      student.matricula,
      student.nome,
      student.nota_final,
      student.taxa_faltas,
      student.faltas_justificadas,
      student.total_aulas,
      student.materias_json
    ]
  );
  await runSql(
    `INSERT INTO historico_academico (matricula, periodo, snapshot_json, salvo_em)
     VALUES (?, ?, ?, ?)`,
    [
      student.matricula,
      0,
      JSON.stringify({ version: 2, periodIndex: 0, capturedAt: '2026-01-01T00:00:00.000Z', student }),
      '2026-01-01T00:00:00.000Z'
    ]
  );
  const partialSnapshot = JSON.stringify({
    version: 1,
    periodIndex: 1,
    capturedAt: '2026-01-02T00:00:00.000Z',
    student: { matricula: 'PARCIAL-001', nome: 'Histórico sem frequência' }
  });
  await runSql(
    `INSERT INTO historico_academico (matricula, periodo, snapshot_json, salvo_em)
     VALUES (?, ?, ?, ?)`,
    ['PARCIAL-001', 1, partialSnapshot, '2026-01-02T00:00:00.000Z']
  );

  const firstRun = await normalizeLegacyAcademicAttendanceData();
  assert.deepEqual(firstRun, {
    studentsUpdated: 1,
    subjectEntriesUpdated: 3,
    historicalSnapshotsUpdated: 1,
    historicalSubjectEntriesUpdated: 3
  });

  const storedStudent = await getSql(
    `SELECT taxa_faltas, faltas_justificadas, total_aulas, materias_json
     FROM alunos WHERE matricula = ?`,
    [student.matricula]
  );
  const storedSubjects = JSON.parse(storedStudent.materias_json);
  assert.deepEqual(
    storedSubjects.map((subject) => [subject.faltas, subject.faltas_justificadas, subject.total_aulas]),
    [[2, 2, 100], [4, 4, 100], [105, 4, 105]]
  );
  assert.equal(storedStudent.taxa_faltas, 111);
  assert.equal(storedStudent.faltas_justificadas, 10);
  assert.equal(storedStudent.total_aulas, 305);

  const historical = await getSql(
    'SELECT snapshot_json FROM historico_academico WHERE matricula = ? AND periodo = 0',
    [student.matricula]
  );
  const historicalSubjects = JSON.parse(historical.snapshot_json).student.materias_json;
  assert.deepEqual(
    JSON.parse(historicalSubjects).map((subject) => [subject.faltas, subject.faltas_justificadas, subject.total_aulas]),
    [[2, 2, 100], [4, 4, 100], [105, 4, 105]]
  );
  const partialHistorical = await getSql(
    'SELECT snapshot_json FROM historico_academico WHERE matricula = ? AND periodo = 1',
    ['PARCIAL-001']
  );
  assert.equal(partialHistorical.snapshot_json, partialSnapshot);

  const secondRun = await normalizeLegacyAcademicAttendanceData();
  assert.deepEqual(secondRun, {
    studentsUpdated: 0,
    subjectEntriesUpdated: 0,
    historicalSnapshotsUpdated: 0,
    historicalSubjectEntriesUpdated: 0
  });
});

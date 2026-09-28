/**
 * Regression coverage for the academic values shown in student tables. The
 * overall status must use the displayed overall values; a risk in one subject
 * stays attached to that subject in the Matérias screen.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-academic-risk-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'escola.db');

const {
  db,
  runSql,
  setupDatabase,
  calculateRisk,
  getVisibleStudentByMatricula
} = require('../src/lib/database');

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

const baseStudent = {
  matricula: 'R-001',
  nome: 'Registro de teste',
  curso: 'Curso de teste',
  turma: 'Turma A',
  nota_final: 80,
  taxa_faltas: 10,
  faltas_justificadas: 0,
  total_aulas: 100,
  materias_json: JSON.stringify([
    { name: 'Matemática', nota: 60, faltas: 10, faltas_justificadas: 0, total_aulas: 100 },
    { name: 'História', nota: 100, faltas: 10, faltas_justificadas: 0, total_aulas: 100 }
  ])
};

test('uma matéria em risco não deixa a média geral regular vermelha', () => {
  const calculated = calculateRisk(baseStudent);
  // Extra arguments used by the former period adjustment must no longer
  // change a stored grade merely because the user selected another period.
  const sameValuesInAnotherPeriod = calculateRisk(baseStudent, 5);

  assert.equal(calculated.nota_final, 80);
  assert.equal(calculated.taxa_faltas, 10);
  assert.equal(calculated.risco_nota, false);
  assert.equal(calculated.risco_faltas, false);
  assert.equal(calculated.situacao_risco, 'Regular');
  assert.equal(calculated.subjects[0].risco_nota, true);
  assert.equal(calculated.subjects[0].situacao_risco, 'Em Risco');
  assert.equal(sameValuesInAnotherPeriod.nota_final, 80);
  assert.equal(sameValuesInAnotherPeriod.subjects[0].nota, 60);
});

test('o risco geral acompanha somente média e faltas exibidas', () => {
  const gradeRisk = calculateRisk({ ...baseStudent, nota_final: 69 });
  const absenceRisk = calculateRisk({ ...baseStudent, taxa_faltas: 25 });

  assert.equal(gradeRisk.risco_nota, true);
  assert.equal(gradeRisk.situacao_risco, 'Em Risco');
  assert.equal(absenceRisk.risco_faltas, true);
  assert.equal(absenceRisk.situacao_risco, 'Em Risco');
});

test('um snapshot antigo é recalculado a partir dos dados históricos brutos', async (t) => {
  t.after(async () => {
    await closeDatabase();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await setupDatabase();
  const legacySnapshot = JSON.stringify({
    version: 1,
    periodIndex: 0,
    capturedAt: '2026-01-01T00:00:00.000Z',
    student: baseStudent,
    calculated: {
      nota_final: 81.25,
      risco_nota: true,
      risco_faltas: false,
      situacao_risco: 'Em Risco'
    }
  });
  await runSql(
    `INSERT INTO historico_academico (matricula, periodo, snapshot_json, salvo_em)
     VALUES (?, ?, ?, ?)`,
    [baseStudent.matricula, 0, legacySnapshot, '2026-01-01T00:00:00.000Z']
  );

  const visible = await getVisibleStudentByMatricula({ role: 'Admin' }, baseStudent.matricula, 0);
  assert.ok(visible);
  assert.equal(visible.nota_final, 80);
  assert.equal(visible.risco_nota, false);
  assert.equal(visible.situacao_risco, 'Regular');
});

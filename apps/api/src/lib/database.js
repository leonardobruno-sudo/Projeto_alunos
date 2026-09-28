/**
 * src/lib/database.js
 *
 * Central database access and domain logic.
 *
 * Responsibilities:
 *   - Initialize the SQLite database and schema
 *   - Normalize student subject records from legacy columns and JSON
 *   - Persist explicit academic snapshots for historical period comparisons
 *   - Apply role-based visibility filtering for students
 *   - Provide helper fetch methods for UI pages and API endpoints
 *
 * Referenced by: src/server.js, src/routes/api.js, src/lib/auth.js and src/scripts/create-admin.js
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { subjects, periods } = require('./constants');
const {
  formatPhone,
  getInitialStudentPassword,
  hashPassword,
  normalizeMatricula,
  normalizeSubjectName,
  verifyPassword
} = require('./utils');
const { canAccessStudent } = require('./permissions');

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', '..', 'data', 'escola.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao abrir banco:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function ensureColumns(tableName, columns) {
  return allSql(`PRAGMA table_info(${tableName})`).then((rows) => {
    const existingColumns = new Set(rows.map((row) => row.name));
    const missingColumns = columns.filter((column) => !existingColumns.has(column.name));
    if (missingColumns.length === 0) return null;
    const statements = missingColumns.map((column) => `ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`);
    return new Promise((resolve, reject) => {
      db.exec(statements.join('; '), (err) => (err ? reject(err) : resolve()));
    });
  });
}

function buildSubjectEntriesFromStudent(student, fallbackSubjects = []) {
  const fallback = fallbackSubjects.length > 0 ? fallbackSubjects : subjects;
  const legacySubjects = fallback.map((name, index) => ({
    name: name || `Matéria ${index + 1}`,
    nota: Number(student?.[`materia${index + 1}`]) || 0,
    faltas: Number(student?.taxa_faltas) || 0,
    faltas_justificadas: Number(student?.faltas_justificadas) || 0,
    total_aulas: Number(student?.total_aulas) || 0
  }));

  if (student?.materias_json) {
    try {
      const parsed = JSON.parse(student.materias_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((entry) => ({
          name: entry.name || 'Matéria',
          nota: Number(entry.nota) || 0,
          faltas: Number(entry.faltas) || 0,
          faltas_justificadas: Number(entry.faltas_justificadas) || 0,
          total_aulas: Number(entry.total_aulas) || 0
        }));
      }
    } catch (error) {
      console.error('Erro ao ler matérias do aluno:', error.message);
    }
  }

  return legacySubjects;
}

function collectSubjectNames(alunos = []) {
  const names = new Set();
  alunos.forEach((student) => {
    buildSubjectEntriesFromStudent(student, subjects).forEach((entry) => {
      if (entry.name) names.add(entry.name);
    });
  });
  return Array.from(names);
}

function getMetricStatus(value, riskThreshold, alertDelta = 5) {
  const numericValue = Number(value) || 0;
  if (numericValue < riskThreshold) {
    return { status: 'Em Risco', isRisk: true, isAlert: false };
  }
  if (numericValue > riskThreshold && numericValue <= riskThreshold + alertDelta) {
    return { status: 'Alerta', isRisk: false, isAlert: true };
  }
  return { status: 'Regular', isRisk: false, isAlert: false };
}

function getAttendanceStatus(value, riskThreshold, alertDelta = 5) {
  const numericValue = Number(value) || 0;
  if (numericValue >= riskThreshold) {
    return { status: 'Em Risco', isRisk: true, isAlert: false };
  }
  if (numericValue >= riskThreshold - alertDelta) {
    return { status: 'Alerta', isRisk: false, isAlert: true };
  }
  return { status: 'Regular', isRisk: false, isAlert: false };
}

function getFiniteNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
}

function calculateRisk(student, periodIndex) {
  const periodAdjustment = periodIndex * 0.25;
  const subjectEntries = buildSubjectEntriesFromStudent(student, subjects).map((entry) => {
    const nota = Number(entry.nota) || 0;
    const faltas = Number(entry.faltas) || 0;
    const justificadas = Number(entry.faltas_justificadas) || 0;
    const totalAulas = Number(entry.total_aulas) || 0;
    const faltasNetas = Math.max(0, faltas - justificadas);
    const taxaFaltasPercent = totalAulas > 0 ? (faltasNetas / totalAulas) * 100 : 0;
    const adjustedNota = nota + periodAdjustment;
    const notaStatus = getMetricStatus(adjustedNota, 70, 5);
    const faltasStatus = getAttendanceStatus(taxaFaltasPercent, 25, 5);
    return {
      ...entry,
      nota: Number(adjustedNota.toFixed(1)),
      percentual_faltas: Number(taxaFaltasPercent.toFixed(1)),
      risco_nota: notaStatus.isRisk,
      alerta_nota: notaStatus.isAlert,
      risco_faltas: faltasStatus.isRisk,
      alerta_faltas: faltasStatus.isAlert,
      situacao_risco: notaStatus.isRisk || faltasStatus.isRisk ? 'Em Risco' : (notaStatus.isAlert || faltasStatus.isAlert ? 'Alerta' : 'Regular')
    };
  });

  const subjectGrades = subjectEntries.map((entry) => Number(entry.nota.toFixed(1)));
  const subjectAverage = subjectGrades.length
    ? subjectGrades.reduce((sum, value) => sum + value, 0) / subjectGrades.length
    : null;
  const storedGrade = getFiniteNonNegativeNumber(student.nota_final);
  const average = storedGrade === null
    ? (subjectAverage ?? 0)
    : storedGrade + periodAdjustment;

  const subjectTotalAulas = subjectEntries.reduce((sum, entry) => sum + (Number(entry.total_aulas) || 0), 0);
  const subjectTotalFaltas = subjectEntries.reduce((sum, entry) => sum + (Number(entry.faltas) || 0), 0);
  const subjectTotalJustificadas = subjectEntries.reduce((sum, entry) => sum + (Number(entry.faltas_justificadas) || 0), 0);
  const storedTotalAulas = getFiniteNonNegativeNumber(student.total_aulas);
  const storedTotalFaltas = getFiniteNonNegativeNumber(student.taxa_faltas);
  const storedTotalJustificadas = getFiniteNonNegativeNumber(student.faltas_justificadas);

  // Older records keep one student-level attendance summary. Prefer it when
  // complete so that duplicating it across subject entries never dilutes the
  // absence percentage (for example, 24/100 must remain 24%, not 24/700).
  const hasStoredAttendanceSummary = storedTotalAulas > 0 &&
    storedTotalFaltas !== null && storedTotalJustificadas !== null;
  const totalAulas = hasStoredAttendanceSummary ? storedTotalAulas : subjectTotalAulas;
  const totalFaltas = hasStoredAttendanceSummary ? storedTotalFaltas : subjectTotalFaltas;
  const totalJustificadas = hasStoredAttendanceSummary ? storedTotalJustificadas : subjectTotalJustificadas;
  const faltasNetas = Math.max(0, totalFaltas - totalJustificadas);
  const taxaFaltasPercent = totalAulas > 0 ? (faltasNetas / totalAulas) * 100 : 0;
  const notaStatus = getMetricStatus(average, 70, 5);
  const faltasStatus = getAttendanceStatus(taxaFaltasPercent, 25, 5);
  const hasGradeRisk = notaStatus.isRisk || subjectEntries.some((entry) => entry.risco_nota);
  const hasGradeAlert = notaStatus.isAlert || subjectEntries.some((entry) => entry.alerta_nota);
  const hasAbsenceRisk = faltasStatus.isRisk || subjectEntries.some((entry) => entry.risco_faltas);
  const hasAbsenceAlert = faltasStatus.isAlert || subjectEntries.some((entry) => entry.alerta_faltas);
  const hasRisk = hasGradeRisk || hasAbsenceRisk;
  const hasAlert = hasGradeAlert || hasAbsenceAlert;

  return {
    ...student,
    nota_final: Number(average.toFixed(1)),
    telefone: formatPhone(student.telefone),
    situacao_risco: hasRisk ? 'Em Risco' : (hasAlert ? 'Alerta' : 'Regular'),
    risco_nota: hasGradeRisk,
    alerta_nota: hasGradeAlert,
    risco_faltas: hasAbsenceRisk,
    alerta_faltas: hasAbsenceAlert,
    subjectGrades,
    subjectAverage: Number(average.toFixed(1)),
    subjects: subjectEntries,
    taxa_faltas: Number(taxaFaltasPercent.toFixed(1))
  };
}

const HISTORY_STUDENT_FIELDS = [
  'matricula', 'nome', 'telefone', 'cotista', 'cota_detalhada', 'categoria',
  'nota_final', 'taxa_faltas', 'faltas_justificadas', 'total_aulas', 'curso',
  'disciplina', 'turma', 'descricao', 'materias_json', 'materia1', 'materia2',
  'materia3', 'materia4', 'materia5', 'materia6', 'materia7'
];

function copyHistoryStudentFields(student) {
  return Object.fromEntries(HISTORY_STUDENT_FIELDS.map((field) => [field, student[field] ?? null]));
}

function buildAcademicHistorySnapshot(student, periodIndex) {
  const source = copyHistoryStudentFields(student);
  return {
    version: 1,
    periodIndex,
    capturedAt: new Date().toISOString(),
    // Keep both the source values and their evaluated result. Source values
    // make the snapshot auditable; the evaluated result prevents a later
    // calculation change from rewriting a saved period.
    student: source,
    calculated: calculateRisk(source, periodIndex)
  };
}

function readAcademicHistorySnapshot(row, periodIndex) {
  if (!row?.snapshot_json) return null;

  try {
    const snapshot = JSON.parse(row.snapshot_json);
    if (!snapshot?.student || Number(snapshot.periodIndex) !== periodIndex) return null;
    if (!getTextValue(snapshot.student.matricula)) return null;

    // New snapshots persist their evaluated output so the period adjustment
    // is never applied twice. The fallback supports any earlier raw-only
    // snapshot format by calculating it exactly once.
    const student = snapshot.calculated && typeof snapshot.calculated === 'object'
      ? snapshot.calculated
      : calculateRisk(snapshot.student, periodIndex);
    return {
      student,
      capturedAt: row.salvo_em || snapshot.capturedAt || null
    };
  } catch (error) {
    console.error('Erro ao ler histórico acadêmico:', error.message);
    return null;
  }
}

function getTextValue(value) {
  return String(value ?? '').trim();
}

function getStudentByMatricula(matricula) {
  const normalizedMatricula = normalizeMatricula(matricula);
  if (!normalizedMatricula) return Promise.resolve(undefined);
  return getSql(
    'SELECT * FROM alunos WHERE lower(trim(matricula)) = lower(trim(?))',
    [normalizedMatricula]
  );
}

async function getHistoryByPeriod(periodIndex) {
  const rows = await allSql(
    'SELECT matricula, snapshot_json, salvo_em FROM historico_academico WHERE periodo = ?',
    [periodIndex]
  );
  const history = new Map();

  for (const row of rows) {
    const snapshot = readAcademicHistorySnapshot(row, periodIndex);
    if (snapshot) history.set(normalizeMatricula(row.matricula), snapshot);
  }

  return history;
}

async function saveAcademicHistoryPeriod(periodIndex, savedBy, { overwrite = false } = {}) {
  const requestedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let totalStudents = 0;
  let periodAlreadySaved = false;
  let savedAt = null;

  await runSql('BEGIN IMMEDIATE');
  try {
    const students = await allSql('SELECT * FROM alunos ORDER BY matricula');
    const existingRows = await allSql(
      'SELECT matricula FROM historico_academico WHERE periodo = ?',
      [periodIndex]
    );
    const existingMatriculas = new Set(
      existingRows.map((row) => normalizeMatricula(row.matricula))
    );
    totalStudents = students.length;
    periodAlreadySaved = existingRows.length > 0;

    // A snapshot closes the roster for that period. New live enrollments
    // cannot appear in an already-saved period unless an Admin explicitly
    // confirms the overwrite.
    if (periodAlreadySaved && !overwrite) {
      unchanged = existingRows.length;
    } else {
      savedAt = requestedAt;
      for (const student of students) {
        const key = normalizeMatricula(student.matricula);
        const snapshot = JSON.stringify(buildAcademicHistorySnapshot(student, periodIndex));
        await runSql(
          `INSERT INTO historico_academico (matricula, periodo, snapshot_json, salvo_em, salvo_por)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(matricula, periodo) DO UPDATE SET
             snapshot_json = excluded.snapshot_json,
             salvo_em = excluded.salvo_em,
             salvo_por = excluded.salvo_por`,
          [student.matricula, periodIndex, snapshot, savedAt, getTextValue(savedBy) || null]
        );
        if (existingMatriculas.has(key)) updated += 1;
        else created += 1;
      }
    }
    await runSql('COMMIT');
  } catch (error) {
    try {
      await runSql('ROLLBACK');
    } catch (_rollbackError) {
      // The original database error is more useful to the caller.
    }
    throw error;
  }

  return {
    periodIndex,
    totalStudents,
    created,
    updated,
    unchanged,
    savedAt,
    periodAlreadySaved,
    requiresOverwrite: periodAlreadySaved && !overwrite
  };
}

function deleteStudentByMatricula(matricula) {
  const normalizedMatricula = normalizeMatricula(matricula);
  if (!normalizedMatricula) return Promise.resolve(null);
  return runSql(
    'DELETE FROM alunos WHERE lower(trim(matricula)) = lower(trim(?))',
    [normalizedMatricula]
  );
}

function updateStudentFields(matricula, updates) {
  const allowedColumns = new Set([
    'telefone', 'cotista', 'cota_detalhada', 'categoria', 'nota_final',
    'taxa_faltas', 'faltas_justificadas', 'total_aulas', 'curso',
    'disciplina', 'turma', 'descricao', 'materias_json', 'materia1',
    'materia2', 'materia3', 'materia4', 'materia5', 'materia6', 'materia7'
  ]);
  const columns = Object.keys(updates).filter((column) => allowedColumns.has(column));
  if (columns.length === 0) return Promise.resolve(null);
  const setClause = columns.map((column) => `${column} = ?`).join(', ');
  const normalizedMatricula = normalizeMatricula(matricula);
  if (!normalizedMatricula) return Promise.resolve(null);
  const params = columns.map((column) => updates[column]).concat(normalizedMatricula);
  return runSql(
    `UPDATE alunos SET ${setClause} WHERE lower(trim(matricula)) = lower(trim(?))`,
    params
  );
}

function insertStudent(student) {
  const {
    matricula, nome, telefone, cotista, cota_detalhada, categoria,
    nota_final, taxa_faltas, faltas_justificadas, total_aulas,
    curso, disciplina, turma, descricao, materias_json,
    materia1, materia2, materia3, materia4, materia5, materia6, materia7
  } = student;
  const normalizedMatricula = normalizeMatricula(matricula);

  return runSql(`INSERT INTO alunos (
      matricula, nome, telefone, cotista, cota_detalhada,
      categoria, nota_final, taxa_faltas, faltas_justificadas, total_aulas,
      curso, disciplina, turma, descricao, materias_json,
      materia1, materia2, materia3, materia4, materia5, materia6, materia7
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    normalizedMatricula, nome, telefone, cotista, cota_detalhada,
    categoria, nota_final, taxa_faltas, faltas_justificadas, total_aulas,
    curso, disciplina, turma, descricao, materias_json,
    materia1, materia2, materia3, materia4, materia5, materia6, materia7
  ]);
}

const STUDENT_ACCOUNT_IDENTIFIER_CONFLICT = 'student_account_identifier_conflict';
const STUDENT_INITIAL_PASSWORD_TOO_LONG = 'student_initial_password_too_long';

function studentAccountProvisionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Builds the canonical non-secret profile shared by an enrollment and its
// access account. Keeping this separate from the initial credential lets
// startup repair stale profile fields without ever replacing a password.
function getStudentAccountIdentityProfile(student) {
  const matricula = normalizeMatricula(student?.matricula);
  if (!matricula) {
    throw studentAccountProvisionError(
      STUDENT_ACCOUNT_IDENTIFIER_CONFLICT,
      'A matrícula é necessária para criar a conta do aluno.'
    );
  }

  return {
    username: matricula,
    role: 'Aluno',
    matricula,
    nome: student?.nome || '',
    curso: student?.curso || '',
    disciplina: student?.disciplina || '',
    turma: student?.turma || ''
  };
}

function getStudentAccountProfile(student) {
  const profile = getStudentAccountIdentityProfile(student);
  const initialPassword = getInitialStudentPassword(student?.matricula, student?.nome);
  if (Buffer.byteLength(initialPassword, 'utf8') > 72) {
    throw studentAccountProvisionError(
      STUDENT_INITIAL_PASSWORD_TOO_LONG,
      'A matrícula e o primeiro nome ultrapassam o tamanho aceito para a senha inicial.'
    );
  }

  return {
    password: hashPassword(initialPassword),
    ...profile
  };
}

function normalizedProfileValue(value) {
  return String(value ?? '').trim();
}

function getStudentAccountProfileDifferences(account, profile) {
  return ['nome', 'curso', 'disciplina', 'turma'].filter((field) => (
    normalizedProfileValue(account?.[field]) !== normalizedProfileValue(profile[field])
  ));
}

function hasStaleInitialStudentPassword(account) {
  const oldInitialPassword = getInitialStudentPassword(account?.matricula, account?.nome);
  return Buffer.byteLength(oldInitialPassword, 'utf8') <= 72 &&
    verifyPassword(oldInitialPassword, account?.password);
}

// The enrollment is the canonical source for profile details. This repair is
// limited to non-secret fields unless the hash proves an account is still on
// the initial password of a different, stale student profile. Custom passwords
// are never reset by startup reconciliation or an import backfill.
async function synchronizeStudentAccountProfile(account, profile) {
  const changedFields = getStudentAccountProfileDifferences(account, profile);
  if (changedFields.length === 0) {
    return { created: false, synchronized: false, passwordReset: false, userId: account.id, changedFields };
  }

  const resetInitialPassword = changedFields.includes('nome') && hasStaleInitialStudentPassword(account);
  if (resetInitialPassword) {
    const replacementPassword = getStudentAccountProfile(profile).password;
    const result = await runSql(
      `UPDATE usuarios
       SET password = ?, nome = ?, curso = ?, disciplina = ?, turma = ?,
           session_version = COALESCE(session_version, 0) + 1
       WHERE id = ? AND role = ? AND password = ?`,
      [
        replacementPassword,
        profile.nome,
        profile.curso,
        profile.disciplina,
        profile.turma,
        account.id,
        'Aluno',
        account.password
      ]
    );
    return {
      created: false,
      synchronized: result.changes === 1,
      passwordReset: result.changes === 1,
      userId: account.id,
      changedFields
    };
  }

  const result = await runSql(
    `UPDATE usuarios
     SET nome = ?, curso = ?, disciplina = ?, turma = ?
     WHERE id = ? AND role = ?`,
    [profile.nome, profile.curso, profile.disciplina, profile.turma, account.id, 'Aluno']
  );
  return {
    created: false,
    synchronized: result.changes === 1,
    passwordReset: false,
    userId: account.id,
    changedFields
  };
}

// Creates an account only when the student has none. An already linked
// account is aligned with the student's current enrollment; its credential is
// replaced only when a stale initial-password hash is proven safe to replace.
async function createStudentAccountIfMissing(student) {
  const matricula = normalizeMatricula(student?.matricula);
  const existingStudentAccount = await getSql(
    `SELECT id, password, matricula, nome, curso, disciplina, turma FROM usuarios
     WHERE role = ? AND lower(trim(matricula)) = lower(trim(?))`,
    ['Aluno', matricula]
  );
  if (existingStudentAccount) {
    return synchronizeStudentAccountProfile(
      existingStudentAccount,
      getStudentAccountIdentityProfile(student)
    );
  }

  const profile = getStudentAccountProfile(student);

  const usernameOwner = await getSql(
    'SELECT id FROM usuarios WHERE lower(trim(username)) = lower(trim(?))',
    [profile.username]
  );
  if (usernameOwner) {
    throw studentAccountProvisionError(
      STUDENT_ACCOUNT_IDENTIFIER_CONFLICT,
      'A matrícula do aluno já é usada como nome de usuário por outra conta.'
    );
  }

  const result = await runSql(
    `INSERT INTO usuarios (username, password, role, matricula, nome, curso, disciplina, turma)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profile.username,
      profile.password,
      profile.role,
      profile.matricula,
      profile.nome,
      profile.curso,
      profile.disciplina,
      profile.turma
    ]
  );
  return { created: true, userId: result.lastID };
}

async function rollbackTransaction() {
  try {
    await runSql('ROLLBACK');
  } catch (_error) {
    // A failed commit may have already ended the transaction.
  }
}

async function withImmediateTransaction(action) {
  await runSql('BEGIN IMMEDIATE');
  try {
    const result = await action();
    await runSql('COMMIT');
    return result;
  } catch (error) {
    await rollbackTransaction();
    throw error;
  }
}

function getEmptyStudentAccountCleanupResult() {
  return { deletedAccounts: 0, deletedSessions: 0 };
}

function getSessionUserId(serializedSession) {
  try {
    const userId = Number(JSON.parse(serializedSession)?.user?.id);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
  } catch (_error) {
    // Malformed sessions are handled by the session store when they are read.
    // This cleanup is intentionally limited to sessions proven to belong to a
    // deleted student account.
    return null;
  }
}

async function deleteSessionsByIds(sessionIds) {
  // SQLite commonly limits a statement to 999 bound values. Chunking keeps
  // cleanup safe even if a large set of old accounts has active sessions.
  for (let index = 0; index < sessionIds.length; index += 500) {
    const chunk = sessionIds.slice(index, index + 500);
    const placeholders = chunk.map(() => '?').join(', ');
    await runSql(`DELETE FROM sessoes WHERE sid IN (${placeholders})`, chunk);
  }
}

// This function must run inside an already-open immediate transaction. It
// removes only accounts whose explicit student matrícula no longer matches an
// active enrollment, case-insensitively. Academic history is deliberately not
// queried, changed or deleted: historical snapshots outlive enrollments.
async function cleanupOrphanStudentAccountsInTransaction() {
  const orphanAccounts = await allSql(
    `SELECT account.id
     FROM usuarios AS account
     WHERE account.role = ?
       AND NOT EXISTS (
         SELECT 1
         FROM alunos AS aluno
         WHERE lower(trim(aluno.matricula)) = lower(trim(COALESCE(account.matricula, '')))
       )`,
    ['Aluno']
  );
  if (orphanAccounts.length === 0) return getEmptyStudentAccountCleanupResult();

  const deletedAccountIds = [];
  for (const account of orphanAccounts) {
    // Recheck the role and matrícula condition at deletion time. The
    // immediate transaction prevents concurrent writers, and the predicate
    // makes this operation safe if the function is ever reused differently.
    const result = await runSql(
      `DELETE FROM usuarios
       WHERE id = ?
         AND role = ?
         AND NOT EXISTS (
           SELECT 1
           FROM alunos
           WHERE lower(trim(alunos.matricula)) = lower(trim(COALESCE(
             (SELECT matricula FROM usuarios WHERE id = ?),
             ''
           )))
         )`,
      [account.id, 'Aluno', account.id]
    );
    if (result.changes === 1) deletedAccountIds.push(account.id);
  }

  if (deletedAccountIds.length === 0) return getEmptyStudentAccountCleanupResult();

  const deletedAccountIdSet = new Set(deletedAccountIds);
  const sessionRows = await allSql('SELECT sid, sess FROM sessoes');
  const sessionIds = sessionRows
    .filter((row) => deletedAccountIdSet.has(getSessionUserId(row.sess)))
    .map((row) => row.sid);
  if (sessionIds.length > 0) await deleteSessionsByIds(sessionIds);

  return {
    deletedAccounts: deletedAccountIds.length,
    deletedSessions: sessionIds.length
  };
}

function logStudentAccountCleanup(result, context) {
  if (!result.deletedAccounts) return;
  console.warn(
    `Limpeza de contas de alunos (${context}): ${result.deletedAccounts} conta(s) antiga(s) removida(s)` +
    `${result.deletedSessions ? ` e ${result.deletedSessions} sess\u00e3o(\u00f5es) vinculada(s) encerrada(s)` : ''}.`
  );
}

// Public wrapper used during startup and by controlled maintenance commands.
// It is intentionally unable to delete Admin, Diretor or Professor accounts.
async function cleanupOrphanStudentAccounts(context = 'inicializa\u00e7\u00e3o') {
  const result = await withImmediateTransaction(cleanupOrphanStudentAccountsInTransaction);
  logStudentAccountCleanup(result, context);
  return result;
}

// Student data and its initial access account must be saved together so a
// successful registration always gives the student a usable login.
async function createStudentWithAccount(student) {
  const normalizedStudent = { ...student, matricula: normalizeMatricula(student?.matricula) };
  const transactionResult = await withImmediateTransaction(async () => {
    // Run before inserting the enrollment. Otherwise an old account using the
    // same matrícula could look active after the insert and retain a stale
    // profile or custom password instead of being replaced for the new aluno.
    const cleanup = await cleanupOrphanStudentAccountsInTransaction();
    await insertStudent(normalizedStudent);
    const account = await createStudentAccountIfMissing(normalizedStudent);
    return { cleanup, account };
  });
  logStudentAccountCleanup(transactionResult.cleanup, 'cria\u00e7\u00e3o de aluno');
  return transactionResult.account;
}

// Safely provisions missing accounts and reconciles stale profiles from older
// data. A credential changes only when its old bcrypt hash proves it is still
// the initial password of a different profile.
async function backfillStudentAccounts() {
  const students = await allSql(
    'SELECT * FROM alunos ORDER BY matricula'
  );
  let created = 0;
  let synchronized = 0;
  let passwordResets = 0;
  let skipped = 0;

  for (const student of students) {
    try {
      const result = await withImmediateTransaction(() => createStudentAccountIfMissing(student));
      if (result.created) created += 1;
      if (result.synchronized) synchronized += 1;
      if (result.passwordReset) passwordResets += 1;
    } catch (error) {
      if (
        error?.code === STUDENT_ACCOUNT_IDENTIFIER_CONFLICT ||
        error?.code === STUDENT_INITIAL_PASSWORD_TOO_LONG
      ) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  if (created > 0) console.log(`${created} conta(s) de aluno criada(s) automaticamente.`);
  if (synchronized > 0) console.warn(`${synchronized} perfil(is) de conta de aluno foram sincronizados com o cadastro.`);
  if (passwordResets > 0) console.warn(`${passwordResets} senha(s) inicial(is) de perfil desatualizado foram redefinida(s) com segurança.`);
  if (skipped > 0) console.warn(`${skipped} conta(s) de aluno não puderam ser criadas automaticamente por conflito de identificador ou senha inicial longa.`);
  return { created, synchronized, passwordResets, skipped };
}

function normalizeSearchText(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().toLocaleLowerCase('pt-BR');
}

function includesSearchText(value, searchTerm) {
  return !searchTerm || normalizeSearchText(value).includes(searchTerm);
}

function matchesExactSearchText(value, expectedValue) {
  return !expectedValue || normalizeSearchText(value) === expectedValue;
}

function matchesAdminFilters(student, filters) {
  return includesSearchText(student.curso, filters.curso) &&
    includesSearchText(student.turma, filters.turma) &&
    includesSearchText(student.categoria, filters.categoria) &&
    matchesExactSearchText(student.cota_detalhada, filters.cota);
}

async function fetchVisibleStudents(req) {
  const query = req.query || {};
  const requestedPeriod = Number(query.periodo);
  const periodIndex = Number.isInteger(requestedPeriod) && requestedPeriod >= 0 && requestedPeriod < periods.length
    ? requestedPeriod
    : 0;
  const buscaMatricula = normalizeSearchText(query.busca_matricula);
  const buscaNome = normalizeSearchText(query.busca_nome);
  const isAdmin = req.session?.user?.role === 'Admin';
  const adminFilters = isAdmin
    ? {
      curso: normalizeSearchText(query.curso),
      turma: normalizeSearchText(query.turma),
      categoria: normalizeSearchText(query.categoria),
      cota: normalizeSearchText(query.cota)
    }
    : { curso: '', turma: '', categoria: '', cota: '' };

  const historyByMatricula = await getHistoryByPeriod(periodIndex);
  const periodSaved = historyByMatricula.size > 0;
  const studentsWithSource = periodSaved
    ? Array.from(historyByMatricula.values()).map((historical) => ({
      student: historical.student,
      source: 'historico',
      capturedAt: historical.capturedAt
    }))
    : (await allSql('SELECT * FROM alunos')).map((student) => ({
      student: calculateRisk(student, periodIndex),
      source: 'atual',
      capturedAt: null
    }));
  const visibleEntries = studentsWithSource.filter(({ student }) => (
    canAccessStudent(req.session.user, student) &&
    includesSearchText(student.matricula, buscaMatricula) &&
    includesSearchText(student.nome, buscaNome) &&
    matchesAdminFilters(student, adminFilters)
  ));
  const historicalStudents = visibleEntries.filter((entry) => entry.source === 'historico').length;
  const liveStudents = visibleEntries.length - historicalStudents;
  const dataSource = periodSaved ? 'historico' : 'atual';

  return {
    alunos: visibleEntries.map((entry) => entry.student),
    total: visibleEntries.length,
    busca_matricula: getTextValue(query.busca_matricula),
    busca_nome: getTextValue(query.busca_nome),
    periodIndex,
    currentPeriodName: periods[periodIndex],
    periodOptions: periods,
    historyAvailable: historicalStudents > 0,
    hasPeriodSnapshot: periodSaved,
    dataSource,
    history: {
      periodSaved,
      historicalStudents,
      liveStudents,
      dataSource
    },
    currentTimestamp: new Date().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  };
}

async function fetchHistoricalStudents(req, periodIndex) {
  const query = req.query || {};
  const buscaMatricula = normalizeSearchText(query.busca_matricula);
  const buscaNome = normalizeSearchText(query.busca_nome);
  const isAdmin = req.session?.user?.role === 'Admin';
  const adminFilters = isAdmin
    ? {
      curso: normalizeSearchText(query.curso),
      turma: normalizeSearchText(query.turma),
      categoria: normalizeSearchText(query.categoria),
      cota: normalizeSearchText(query.cota)
    }
    : { curso: '', turma: '', categoria: '', cota: '' };
  const historyByMatricula = await getHistoryByPeriod(periodIndex);
  const alunos = Array.from(historyByMatricula.values())
    .map((entry) => entry.student)
    .filter((student) => (
      canAccessStudent(req.session.user, student) &&
      includesSearchText(student.matricula, buscaMatricula) &&
      includesSearchText(student.nome, buscaNome) &&
      matchesAdminFilters(student, adminFilters)
    ));

  return {
    alunos,
    periodSaved: historyByMatricula.size > 0,
    hasVisibleRecords: alunos.length > 0,
    periodIndex,
    currentPeriodName: periods[periodIndex]
  };
}

async function setupDatabase() {
  await runSql(`CREATE TABLE IF NOT EXISTS alunos (
      matricula TEXT PRIMARY KEY,
      nome TEXT,
      telefone TEXT,
      cotista TEXT,
      cota_detalhada TEXT,
      categoria TEXT,
      nota_final REAL,
      taxa_faltas INTEGER,
      faltas_justificadas INTEGER,
      total_aulas INTEGER DEFAULT 100,
      curso TEXT,
      disciplina TEXT,
      turma TEXT,
      descricao TEXT,
      materias_json TEXT,
      materia1 REAL,
      materia2 REAL,
      materia3 REAL,
      materia4 REAL,
      materia5 REAL,
      materia6 REAL,
      materia7 REAL
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      matricula TEXT,
      nome TEXT,
      curso TEXT,
      disciplina TEXT,
      turma TEXT,
      session_version INTEGER NOT NULL DEFAULT 0
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      setor TEXT,
      descricao TEXT,
      usuario TEXT,
      timestamp TEXT
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS sessoes (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    )`);

  await runSql(`CREATE TABLE IF NOT EXISTS historico_academico (
      matricula TEXT NOT NULL,
      periodo INTEGER NOT NULL CHECK (periodo >= 0 AND periodo < 6),
      snapshot_json TEXT NOT NULL,
      salvo_em TEXT NOT NULL,
      salvo_por TEXT,
      PRIMARY KEY (matricula, periodo)
    )`);

  await ensureColumns('historico_academico', [
    { name: 'salvo_em', definition: 'TEXT' },
    { name: 'salvo_por', definition: 'TEXT' }
  ]);

  await runSql(`CREATE INDEX IF NOT EXISTS historico_academico_periodo_idx
    ON historico_academico (periodo)`);

  await runSql('DROP TRIGGER IF EXISTS delete_student_account_after_student_delete');
  await runSql(`CREATE TRIGGER delete_student_account_after_student_delete
    AFTER DELETE ON alunos
    BEGIN
      DELETE FROM usuarios
      WHERE role = 'Aluno' AND lower(trim(matricula)) = lower(trim(OLD.matricula));
    END`);

  // Historical records intentionally outlive a current enrollment. Drop the
  // trigger from an earlier schema revision if this database was initialized
  // before that rule was corrected.
  await runSql('DROP TRIGGER IF EXISTS delete_student_history_after_student_delete');

  await ensureColumns('alunos', [
      { name: 'curso', definition: 'TEXT' },
      { name: 'disciplina', definition: 'TEXT' },
      { name: 'turma', definition: 'TEXT' },
      { name: 'descricao', definition: 'TEXT' },
      { name: 'materias_json', definition: 'TEXT' },
      { name: 'materia1', definition: 'REAL' },
      { name: 'materia2', definition: 'REAL' },
      { name: 'materia3', definition: 'REAL' },
      { name: 'materia4', definition: 'REAL' },
      { name: 'materia5', definition: 'REAL' },
      { name: 'materia6', definition: 'REAL' },
      { name: 'materia7', definition: 'REAL' }
  ]);

  await ensureColumns('usuarios', [
      { name: 'curso', definition: 'TEXT' },
      { name: 'disciplina', definition: 'TEXT' },
      { name: 'turma', definition: 'TEXT' },
      { name: 'session_version', definition: 'INTEGER NOT NULL DEFAULT 0' }
  ]);

  // Remove only student accounts that no longer have an enrollment before
  // enforcing account indexes or provisioning missing accounts. This leaves
  // staff accounts and academic snapshots untouched.
  await cleanupOrphanStudentAccounts();

  // The primary key alone treats `A1` and `a1` as different values. This
  // expression index keeps legacy lookups compatible while preventing that
  // ambiguity for all future registrations and CSV imports.
  await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS unique_alunos_matricula_normalizada
    ON alunos (lower(trim(matricula)))`);

  await runSql(`CREATE UNIQUE INDEX IF NOT EXISTS unique_student_account_matricula
    ON usuarios (lower(trim(matricula)))
    WHERE role = 'Aluno' AND trim(COALESCE(matricula, '')) <> ''`);

  // Keep name-based login and the academic access scope current after an
  // administrator edits a student's registration. Passwords are untouched.
  await runSql('DROP TRIGGER IF EXISTS sync_student_account_after_student_update');
  await runSql(`CREATE TRIGGER sync_student_account_after_student_update
    AFTER UPDATE OF nome, curso, disciplina, turma ON alunos
    BEGIN
      UPDATE usuarios
      SET nome = NEW.nome,
          curso = NEW.curso,
          disciplina = NEW.disciplina,
          turma = NEW.turma
      WHERE role = 'Aluno' AND lower(trim(matricula)) = lower(trim(NEW.matricula));
    END`);

  await backfillStudentAccounts();

}

async function getVisibleStudentByMatricula(user, matricula, periodIndex = 0) {
  const student = await getStudentByMatricula(matricula);
  const [historyRow, periodSnapshot] = await Promise.all([
    getSql(
      `SELECT matricula, snapshot_json, salvo_em
       FROM historico_academico
       WHERE lower(trim(matricula)) = lower(trim(?)) AND periodo = ?`,
      [student?.matricula || matricula, periodIndex]
    ),
    getSql('SELECT 1 AS saved FROM historico_academico WHERE periodo = ? LIMIT 1', [periodIndex])
  ]);
  const snapshot = readAcademicHistorySnapshot(historyRow, periodIndex);
  // Once the period roster is closed, current records absent from it must not
  // leak into historical views. This also still permits a deleted student to
  // be read from their saved snapshot.
  const visibleStudent = snapshot?.student || (!periodSnapshot && student
    ? calculateRisk(student, periodIndex)
    : null);
  if (!visibleStudent) return null;
  return canAccessStudent(user, visibleStudent) ? visibleStudent : null;
}

function backupDatabase(callback) {
  const backupPath = `${dbPath}.backup`;
  fs.copyFile(dbPath, backupPath, (err) => {
    if (err) {
      console.error('Erro ao criar backup do banco de dados:', err.message);
    } else {
      console.log('Backup do banco de dados criado em', backupPath);
    }
    if (callback) callback(err);
  });
}

module.exports = {
  db,
  runSql,
  getSql,
  allSql,
  setupDatabase,
  backupDatabase,
  buildSubjectEntriesFromStudent,
  collectSubjectNames,
  fetchVisibleStudents,
  fetchHistoricalStudents,
  getVisibleStudentByMatricula,
  getStudentByMatricula,
  saveAcademicHistoryPeriod,
  deleteStudentByMatricula,
  cleanupOrphanStudentAccounts,
  createStudentWithAccount,
  updateStudentFields
};

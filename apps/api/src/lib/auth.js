/**
 * Authentication domain service for credential validation, safe legacy
 * student migration and password changes without exposing password hashes.
 */
const crypto = require('crypto');
const { getSql, allSql, runSql } = require('./database');
const {
  verifyPassword,
  hashPassword,
  isPasswordHash,
  normalizeLookupValue,
  getInitialStudentPassword
} = require('./utils');

const INVALID_CREDENTIALS_CODE = 'invalid_credentials';
const INVALID_CURRENT_PASSWORD_CODE = 'invalid_current_password';

function authenticationError() {
  const error = new Error('Invalid credentials.');
  error.code = INVALID_CREDENTIALS_CODE;
  return error;
}

function currentPasswordError() {
  const error = new Error('Invalid current password.');
  error.code = INVALID_CURRENT_PASSWORD_CODE;
  return error;
}

function normalizeUser(userRow) {
  if (!userRow) return null;
  return {
    id: userRow.id,
    username: userRow.username,
    role: userRow.role,
    matricula: userRow.matricula,
    nome: userRow.nome,
    curso: userRow.curso,
    disciplina: userRow.disciplina,
    turma: userRow.turma,
    sessionVersion: Number(userRow.session_version) || 0
  };
}

function getLegacyStudentPassword(student) {
  return getInitialStudentPassword(student.matricula, student.nome);
}

function stringsMatchExactly(left, right) {
  const leftValue = Buffer.from(String(left || ''), 'utf8');
  const rightValue = Buffer.from(String(right || ''), 'utf8');
  return leftValue.length === rightValue.length && crypto.timingSafeEqual(leftValue, rightValue);
}

function isLegacyStudentPasswordMatch(passwordInput, student) {
  return stringsMatchExactly(passwordInput, getLegacyStudentPassword(student));
}

function legacyStudentLoginEnabled() {
  return String(process.env.ENABLE_LEGACY_STUDENT_LOGIN || '').toLowerCase() === 'true';
}

async function findExistingUser(normalizedLogin) {
  const byUsername = await getSql(
    'SELECT * FROM usuarios WHERE lower(trim(username)) = ?',
    [normalizedLogin]
  );
  if (byUsername) return { user: byUsername, ambiguous: false };

  const byMatricula = await getSql(
    'SELECT * FROM usuarios WHERE role = ? AND lower(trim(matricula)) = ?',
    ['Aluno', normalizedLogin]
  );
  if (byMatricula) return { user: byMatricula, ambiguous: false };

  // Names are convenience identifiers only for non-admin accounts. Multiple
  // matches deliberately fail instead of choosing an arbitrary account.
  const usersByName = await allSql(
    `SELECT * FROM usuarios
     WHERE role IN ('Aluno', 'Professor', 'Diretor') AND lower(trim(nome)) = ?`,
    [normalizedLogin]
  );
  if (usersByName.length === 1) return { user: usersByName[0], ambiguous: false };
  return { user: null, ambiguous: usersByName.length > 1 };
}

async function findLegacyStudent(normalizedLogin) {
  const byMatricula = await getSql(
    'SELECT * FROM alunos WHERE lower(trim(matricula)) = ?',
    [normalizedLogin]
  );
  if (byMatricula) return { student: byMatricula, ambiguous: false };

  const studentsByName = await allSql(
    'SELECT * FROM alunos WHERE lower(trim(nome)) = ?',
    [normalizedLogin]
  );
  if (studentsByName.length === 1) return { student: studentsByName[0], ambiguous: false };
  return { student: null, ambiguous: studentsByName.length > 1 };
}

async function findStudentForLegacyUser(user) {
  const candidateMatricula = normalizeLookupValue(user.matricula || user.username);
  if (!candidateMatricula) return null;
  return getSql('SELECT * FROM alunos WHERE lower(trim(matricula)) = ?', [candidateMatricula]);
}

async function migrateStoredLegacyPassword(user, passwordInput) {
  if (!legacyStudentLoginEnabled() || user.role !== 'Aluno' || isPasswordHash(user.password)) {
    return null;
  }

  const student = await findStudentForLegacyUser(user);
  if (!student || !isLegacyStudentPasswordMatch(passwordInput, student) || !isLegacyStudentPasswordMatch(user.password, student)) {
    return null;
  }

  const result = await runSql(
    `UPDATE usuarios
     SET password = ?, session_version = COALESCE(session_version, 0) + 1
     WHERE id = ? AND password = ?`,
    [hashPassword(passwordInput), user.id, user.password]
  );
  if (result.changes !== 1) return null;

  const migratedUser = await getSql('SELECT * FROM usuarios WHERE id = ?', [user.id]);
  return normalizeUser(migratedUser);
}

async function authenticateLegacyStudent(normalizedLogin, passwordInput) {
  if (!legacyStudentLoginEnabled()) throw authenticationError();

  const lookup = await findLegacyStudent(normalizedLogin);
  if (!lookup.student || lookup.ambiguous || !isLegacyStudentPasswordMatch(passwordInput, lookup.student)) {
    throw authenticationError();
  }

  // Do not use INSERT OR IGNORE: a matrícula that collides with an existing
  // username must fail safely instead of authenticating the wrong account.
  const normalizedMatricula = normalizeLookupValue(lookup.student.matricula);
  const existingUsername = await getSql(
    'SELECT id FROM usuarios WHERE lower(trim(username)) = ?',
    [normalizedMatricula]
  );
  const existingStudentAccount = await getSql(
    'SELECT id FROM usuarios WHERE role = ? AND lower(trim(matricula)) = ?',
    ['Aluno', normalizedMatricula]
  );
  if (existingUsername || existingStudentAccount) throw authenticationError();

  try {
    const result = await runSql(
      `INSERT INTO usuarios (username, password, role, matricula, nome, curso, disciplina, turma)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lookup.student.matricula,
        hashPassword(passwordInput),
        'Aluno',
        lookup.student.matricula,
        lookup.student.nome,
        lookup.student.curso,
        lookup.student.disciplina,
        lookup.student.turma
      ]
    );
    const createdUser = await getSql('SELECT * FROM usuarios WHERE id = ?', [result.lastID]);
    return normalizeUser(createdUser);
  } catch (error) {
    if (String(error.code || '').startsWith('SQLITE_CONSTRAINT')) throw authenticationError();
    throw error;
  }
}

async function authenticateUser(usernameInput, passwordInput) {
  const normalizedLogin = normalizeLookupValue(usernameInput);
  if (!normalizedLogin || !passwordInput || Buffer.byteLength(passwordInput, 'utf8') > 72) {
    throw authenticationError();
  }

  const lookup = await findExistingUser(normalizedLogin);
  if (lookup.ambiguous) throw authenticationError();

  if (lookup.user) {
    if (verifyPassword(passwordInput, lookup.user.password)) return normalizeUser(lookup.user);

    const migratedUser = await migrateStoredLegacyPassword(lookup.user, passwordInput);
    if (migratedUser) return migratedUser;
    throw authenticationError();
  }

  return authenticateLegacyStudent(normalizedLogin, passwordInput);
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await getSql('SELECT * FROM usuarios WHERE id = ?', [userId]);
  if (!user || Buffer.byteLength(currentPassword, 'utf8') > 72 || !verifyPassword(currentPassword, user.password)) {
    throw currentPasswordError();
  }

  await runSql(
    'UPDATE usuarios SET password = ?, session_version = COALESCE(session_version, 0) + 1 WHERE id = ?',
    [hashPassword(newPassword), user.id]
  );
  const updatedUser = await getSql('SELECT * FROM usuarios WHERE id = ?', [user.id]);
  return normalizeUser(updatedUser);
}

module.exports = {
  authenticateUser,
  changePassword,
  normalizeUser,
  getLegacyStudentPassword
};

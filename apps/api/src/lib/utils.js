/** Common formatting, normalization and password helpers used by the server. */

const bcrypt = require('bcryptjs');

/**
 * src/lib/utils.js
 *
 * Shared utility functions for string normalization and password hashing.
 *
 * Used by:
 *   - src/lib/database.js
 *   - src/routes/api.js
 */
function formatPhone(value) {
  const phone = (value || '').replace(/\D/g, '');
  if (phone.length >= 11) {
    return `(${phone.substring(0, 2)}) ${phone.substring(2, 7)}-${phone.substring(7, 11)}`;
  }
  return value || '';
}

function getFirstName(nome) {
  return (nome || '').trim().split(/\s+/)[0] || 'aluno';
}

// Keeps the institution's existing first-access convention in one place.
// Callers must hash this value before persistence and should encourage the
// student to change it after the first login.
function getInitialStudentPassword(matricula, nome) {
  return `IFRR.${String(matricula || '').trim()}@${getFirstName(nome)}`;
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function isPasswordHash(storedHash) {
  return /^\$2[aby]\$\d{2}\$/.test(String(storedHash || ''));
}

function verifyPassword(password, storedHash) {
  if (!isPasswordHash(storedHash)) return false;
  return bcrypt.compareSync(password, storedHash);
}

function normalizeLookupValue(value) {
  return (value || '').toString().trim().toLowerCase();
}

// Student registration numbers are identifiers, not display text. Keep their
// persisted representation predictable while database lookups remain tolerant
// of older rows that were stored with different casing or outer whitespace.
function normalizeMatricula(value) {
  return String(value ?? '').trim().toUpperCase();
}

// normalizeSubjectName is used to compare user-provided subject names in a
// case-insensitive, whitespace-normalized way.
function normalizeSubjectName(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

module.exports = {
  formatPhone,
  getFirstName,
  getInitialStudentPassword,
  hashPassword,
  verifyPassword,
  isPasswordHash,
  normalizeLookupValue,
  normalizeMatricula,
  normalizeSubjectName
};

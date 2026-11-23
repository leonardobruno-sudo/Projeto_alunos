/**
 * Papel de `utils`: oferece recursos compartilhados ao servidor, como sessão, permissões, respostas e acesso ao banco.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/** Funções compartilhadas pelo servidor para formatar e normalizar dados e proteger senhas. */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Arquivo: `src/lib/utils.js`.
 *
 * Funções compartilhadas para normalizar textos e gerar hashes de senha.
 *
 * Usado por:
 *   - `src/lib/database.js`.
 *   - `src/routes/api.js`.
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

// A regra antiga de primeiro acesso serve somente para reconhecer contas
// criadas em versões anteriores. Não a use para criar contas novas: matrícula
// e nome são identificadores previsíveis, não credenciais seguras.
function getInitialStudentPassword(matricula, nome) {
  return `IFRR.${String(matricula || '').trim()}@${getFirstName(nome)}`;
}

// A senha temporária existe em memória e é mostrada uma vez à pessoa autorizada
// que criou ou redefiniu a conta. No banco fica somente seu hash bcrypt.
// A senha aleatória em hexadecimal é fácil de distinguir quando entregue pela secretaria.
function generateTemporaryStudentPassword() {
  return `SGAC-${crypto.randomBytes(18).toString('hex')}`;
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

// Matrículas são identificadores, não texto de exibição. Mantemos o formato
// salvo previsível e aceitamos diferenças antigas de caixa ou espaços nas buscas.
function normalizeMatricula(value) {
  return String(value ?? '').trim().toUpperCase();
}

// Compara nomes de matérias informados pelas pessoas sem diferenciar
// maiúsculas e minúsculas e depois de normalizar os espaços.
function normalizeSubjectName(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

module.exports = {
  formatPhone,
  getFirstName,
  getInitialStudentPassword,
  generateTemporaryStudentPassword,
  hashPassword,
  verifyPassword,
  isPasswordHash,
  normalizeLookupValue,
  normalizeMatricula,
  normalizeSubjectName
};

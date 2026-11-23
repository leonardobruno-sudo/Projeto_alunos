/**
 * Papel de `student.service`: implementa regras de negócio do domínio e conversa com os serviços compartilhados e o banco sem depender da interface.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Serviço de listagem de alunos; o escopo é aplicado pela camada de dados compartilhada.
 * Essa camada define a visibilidade com base na sessão autenticada no servidor.
 */
const { fetchVisibleStudents } = require('../../lib/database');

function numberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toStudentListItemDto(student) {
  return {
    matricula: String(student.matricula || ''),
    nome: String(student.nome || ''),
    telefone: student.telefone || null,
    curso: student.curso || null,
    turma: student.turma || null,
    nota_final: numberOrNull(student.nota_final),
    taxa_faltas: numberOrNull(student.taxa_faltas),
    risco_nota: student.risco_nota === true,
    risco_faltas: student.risco_faltas === true,
    situacao_risco: student.situacao_risco || 'Regular'
  };
}

function toStudentListDto(data) {
  return {
    alunos: (data.alunos || []).map(toStudentListItemDto),
    total: Number(data.total) || 0,
    page: Number(data.page) || 1,
    pageSize: Number(data.pageSize) || 20,
    totalPages: Number(data.totalPages) || 1,
    hasPreviousPage: data.hasPreviousPage === true,
    hasNextPage: data.hasNextPage === true,
    sort: data.sort || 'nome',
    direction: data.direction === 'desc' ? 'desc' : 'asc',
    filters: data.filters || {},
    subjectNames: Array.isArray(data.subjectNames) ? data.subjectNames : [],
    periodIndex: data.periodIndex,
    currentPeriodName: data.currentPeriodName,
    periodOptions: data.periodOptions || [],
    historyAvailable: data.historyAvailable === true,
    hasPeriodSnapshot: data.hasPeriodSnapshot === true,
    dataSource: data.dataSource,
    snapshotAt: data.snapshotAt || null,
    history: data.history,
    currentTimestamp: data.currentTimestamp
  };
}

async function listStudents(req, query) {
  const data = await fetchVisibleStudents({
    query,
    session: req.session
  }, { paginate: true });
  return toStudentListDto(data);
}

module.exports = {
  listStudents,
  toStudentListItemDto
};

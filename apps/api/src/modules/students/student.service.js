/**
 * Student list service. It deliberately delegates scope enforcement to the
 * shared data layer, which derives all visibility from the server session.
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

/** Express controller for the paginated student DTO endpoint. */
const { apiBadRequest, apiServerError, apiSuccess } = require('../../lib/apiResponse');
const { parseStudentSearchQuery } = require('./student.dto');
const { listStudents } = require('./student.service');

async function list(req, res) {
  const parsed = parseStudentSearchQuery(req.query);
  if (parsed.error) return apiBadRequest(res, parsed.error);

  try {
    const data = await listStudents(req, parsed.data);
    return apiSuccess(res, data);
  } catch (error) {
    console.error('Erro ao buscar alunos:', error.stack || error.message || error);
    return apiServerError(res, 'Erro ao buscar alunos.');
  }
}

module.exports = {
  list
};

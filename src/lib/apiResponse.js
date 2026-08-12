/**
 * src/lib/apiResponse.js
 *
 * Standardized JSON responses for all /api routes.
 *
 * Used by: src/routes/api.js
 */
function apiSuccess(res, data = null, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function apiCreated(res, data = null, message = 'Criado com sucesso.') {
  return apiSuccess(res, data, message, 201);
}

function apiBadRequest(res, message = 'Requisição inválida', code = 'bad_request') {
  return res.status(400).json({ success: false, error: { code, message } });
}

function apiNotFound(res, message = 'Não encontrado', code = 'not_found') {
  return res.status(404).json({ success: false, error: { code, message } });
}

function apiForbidden(res, message = 'Acesso negado', code = 'forbidden') {
  return res.status(403).json({ success: false, error: { code, message } });
}

function apiUnauthorized(res, message = 'Sessão expirada ou inválida.', code = 'unauthorized') {
  return res.status(401).json({ success: false, error: { code, message } });
}

function apiConflict(res, message = 'O recurso já existe.', code = 'conflict') {
  return res.status(409).json({ success: false, error: { code, message } });
}

function apiServerError(res, message = 'Erro interno do servidor', code = 'internal_error') {
  return res.status(500).json({ success: false, error: { code, message } });
}

module.exports = {
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  apiUnauthorized,
  apiConflict,
  apiServerError
};

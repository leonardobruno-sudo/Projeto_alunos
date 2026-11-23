/**
 * Papel de `chatController`: implementa regras de negócio do domínio e conversa com os serviços compartilhados e o banco sem depender da interface.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Adapta requisições Express à rota `POST /chat`.
 *
 * Monte a rota atrás do middleware de autenticação `ensureAuth`:
 *   router.post('/chat', ensureAuth, createChatController());
 * Ou chame `registerChatRoute(router)` para aplicar esse middleware automaticamente.
 * O controlador obtém a identidade de `req.session.user`, nunca do corpo da requisição.
 */
'use strict';

const { ensureAuth } = require('../../lib/helpers');
const { apiSuccess } = require('../../lib/apiResponse');
const { ChatDtoValidationError, validateChatDto } = require('./chatDto');
const { ChatAuthorizationError } = require('./commandController');
const { AiChatService } = require('./aiService');

function sendError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message }
  });
}

function getSessionUser(req) {
  return req?.session?.user && typeof req.session.user === 'object'
    ? req.session.user
    : null;
}

/** Cria o controlador da requisição e define o formato JSON de sucesso do chat. */
function createChatController({ chatService = new AiChatService() } = {}) {
  if (!chatService || typeof chatService.respond !== 'function') {
    throw new TypeError('Um serviço de chat válido é obrigatório.');
  }

  return async function postChat(req, res) {
    const user = getSessionUser(req);
    if (!user) return sendError(res, 401, 'unauthorized', 'Sessão expirada ou inválida.');

    let input;
    try {
      input = validateChatDto(req.body);
    } catch (error) {
      if (error instanceof ChatDtoValidationError) {
        return sendError(res, error.statusCode, error.code, error.message);
      }
      return sendError(res, 400, 'invalid_chat_request', 'Não foi possível validar a mensagem.');
    }

    try {
      const response = await chatService.respond({ user, message: input.message, contextMessage: input.contextMessage });
      // A resposta pública contém apenas os campos necessários; o contexto interno
      // autorizado não é enviado de volta ao navegador.
      return apiSuccess(res, {
        message: response.message,
        mode: response.mode,
        intent: response.intent,
        sources: response.sources,
        scope: response.scope
      }, 'Resposta do assistente pronta.');
    } catch (error) {
      if (error instanceof ChatAuthorizationError || error?.code === 'unauthorized') {
        return sendError(res, 401, 'unauthorized', 'Sessão expirada ou inválida.');
      }
      return sendError(res, 500, 'internal_error', 'Não foi possível consultar o assistente agora.');
    }
  };
}

/**
 * Esta função é exportada sem registro automático para manter o módulo
 * independente e evitar alterações nas rotas existentes do SGAC.
 */
function registerChatRoute(router, options) {
  if (!router || typeof router.post !== 'function') {
    throw new TypeError('Um roteador Express com o método post é obrigatório.');
  }

  router.post('/chat', ensureAuth, createChatController(options));
  return router;
}

module.exports = {
  createChatController,
  getSessionUser,
  registerChatRoute
};

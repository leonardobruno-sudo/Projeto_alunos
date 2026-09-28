/**
 * Express adapter for POST /chat.
 *
 * Mount it behind the existing `ensureAuth` middleware:
 *   router.post('/chat', ensureAuth, createChatController());
 * or call `registerChatRoute(router)` to apply that middleware automatically.
 * The handler reads identity only from req.session.user, never from the body.
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

/** Creates a request handler whose successful JSON body is the chat contract. */
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
      const response = await chatService.respond({ user, message: input.message });
      // Keep the public contract deliberately small; internal authorized
      // context is not serialized back to the browser.
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
 * Optional integration helper. It is intentionally exported rather than
 * mounted here so this isolated module does not modify SGAC's existing routes.
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

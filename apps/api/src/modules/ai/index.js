/**
 * Papel de `ai`: implementa regras de negócio do domínio e conversa com os serviços compartilhados e o banco sem depender da interface.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Interface pública para integrar o módulo independente de IA do SGAC.
 *
 * Exemplo de uso em um arquivo de rotas:
 *   const { registerChatRoute } = require('../modules/ai');
 *   registerChatRoute(router); // registra POST /chat com autenticação
 */
'use strict';

const {
  MAX_CHAT_MESSAGE_LENGTH,
  ChatDtoValidationError,
  validateChatDto
} = require('./chatDto');
const {
  MAX_LIST_ITEMS,
  MAX_SEARCH_VALUE_LENGTH,
  CHAT_INTENTS,
  ChatAuthorizationError,
  ChatCommandController,
  buildScope,
  buildStatistics,
  classifyIntent,
  parseSearchCommand,
  toSafeStudent
} = require('./commandController');
const {
  DEFAULT_LOCAL_AI_URL,
  MAX_AI_RESPONSE_LENGTH,
  LOCAL_AI_TIMEOUT_MS,
  AiChatService,
  buildAiInstructions,
  createPrompt,
  getConfiguredModel,
  getLocalAiEndpoint,
  requestLocalModel,
  sanitizeGeneratedMessage
} = require('./aiService');
const {
  createChatController,
  getSessionUser,
  registerChatRoute
} = require('./chatController');

module.exports = {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_LIST_ITEMS,
  MAX_SEARCH_VALUE_LENGTH,
  DEFAULT_LOCAL_AI_URL,
  MAX_AI_RESPONSE_LENGTH,
  LOCAL_AI_TIMEOUT_MS,
  CHAT_INTENTS,
  ChatDtoValidationError,
  ChatAuthorizationError,
  ChatCommandController,
  AiChatService,
  validateChatDto,
  buildScope,
  buildStatistics,
  classifyIntent,
  parseSearchCommand,
  toSafeStudent,
  buildAiInstructions,
  createPrompt,
  getConfiguredModel,
  getLocalAiEndpoint,
  requestLocalModel,
  sanitizeGeneratedMessage,
  createChatController,
  getSessionUser,
  registerChatRoute
};

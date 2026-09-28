/**
 * Public integration surface for the isolated SGAC AI module.
 *
 * Example (in a future route file):
 *   const { registerChatRoute } = require('../modules/ai');
 *   registerChatRoute(router); // registers authenticated POST /chat
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

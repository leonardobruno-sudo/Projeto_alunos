/**
 * Runtime boundary for the SGAC chat endpoint.
 *
 * The browser may submit only a human message. Identity, role, matrícula and
 * every permission value deliberately come from the server session instead of
 * this DTO, so a caller cannot widen its own access with request fields.
 */
'use strict';

const MAX_CHAT_MESSAGE_LENGTH = 1000;

class ChatDtoValidationError extends Error {
  constructor(message, code = 'invalid_chat_request') {
    super(message);
    this.name = 'ChatDtoValidationError';
    this.code = code;
    this.statusCode = 400;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Validates the complete request body rather than merely reading `message`.
 * Rejecting unknown fields is intentional: fields such as role, user and
 * matrícula must never be accepted from a chat client.
 */
function validateChatDto(body) {
  if (!isPlainObject(body)) {
    throw new ChatDtoValidationError('O corpo da conversa deve conter apenas um objeto com a mensagem.');
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'message') {
    throw new ChatDtoValidationError('Envie apenas o campo "message" para o chat.');
  }

  if (typeof body.message !== 'string') {
    throw new ChatDtoValidationError('A mensagem deve ser um texto.');
  }

  // Array.from counts Unicode code points, avoiding a surprising double count
  // for emoji or accented characters represented by surrogate pairs.
  if (Array.from(body.message).length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new ChatDtoValidationError(`A mensagem deve ter no máximo ${MAX_CHAT_MESSAGE_LENGTH} caracteres.`);
  }

  const message = body.message.trim();
  if (!message) {
    throw new ChatDtoValidationError('Digite uma mensagem para continuar.');
  }

  return Object.freeze({ message });
}

module.exports = {
  MAX_CHAT_MESSAGE_LENGTH,
  ChatDtoValidationError,
  validateChatDto
};

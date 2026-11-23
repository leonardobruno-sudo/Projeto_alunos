/**
 * Papel de `chatDto`: implementa regras de negócio do domínio e conversa com os serviços compartilhados e o banco sem depender da interface.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/**
 * Valida os dados que entram na rota de chat do SGAC.
 *
 * O navegador pode enviar uma mensagem e a pergunta anterior para resolver
 * uma continuação local. Identidade, perfil, matrícula e permissões
 * vêm da sessão do servidor, e não
 * deste DTO; assim, a requisição não pode ampliar o próprio acesso.
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
 * Valida todo o corpo da requisição em vez de ler somente `message`.
 * Campos desconhecidos são rejeitados de propósito. Perfil, usuário e matrícula
 * nunca devem ser aceitos como dados enviados pelo chat.
 */
function validateChatDto(body) {
  if (!isPlainObject(body)) {
    throw new ChatDtoValidationError('O corpo da conversa deve conter apenas um objeto com a mensagem.');
  }

  const keys = Object.keys(body);
  if (keys.some((key) => !['message', 'contextMessage'].includes(key)) || !keys.includes('message')) {
    throw new ChatDtoValidationError('Envie apenas "message" e, opcionalmente, "contextMessage" para o chat.');
  }

  if (typeof body.message !== 'string') {
    throw new ChatDtoValidationError('A mensagem deve ser um texto.');
  }

  // `Array.from` conta caracteres Unicode completos e evita contar duas vezes
  // emojis ou caracteres acentuados representados por pares substitutos.
  if (Array.from(body.message).length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new ChatDtoValidationError(`A mensagem deve ter no máximo ${MAX_CHAT_MESSAGE_LENGTH} caracteres.`);
  }

  const message = body.message.trim();
  if (!message) {
    throw new ChatDtoValidationError('Digite uma mensagem para continuar.');
  }

  let contextMessage;
  if (body.contextMessage !== undefined) {
    if (typeof body.contextMessage !== 'string' || Array.from(body.contextMessage).length > MAX_CHAT_MESSAGE_LENGTH) {
      throw new ChatDtoValidationError(`O contexto da conversa deve ter no máximo ${MAX_CHAT_MESSAGE_LENGTH} caracteres.`);
    }
    contextMessage = body.contextMessage.trim();
  }

  return Object.freeze({ message, ...(contextMessage ? { contextMessage } : {}) });
}

module.exports = {
  MAX_CHAT_MESSAGE_LENGTH,
  ChatDtoValidationError,
  validateChatDto
};

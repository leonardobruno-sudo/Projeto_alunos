/**
 * Deterministic command layer for SGAC chat.
 *
 * An LLM never chooses what to query. This controller recognizes a small,
 * read-only command set, obtains data through the existing visibility-aware
 * database helpers and applies the existing permission function once more as
 * defense in depth. It never imports raw SQLite access or mutation helpers.
 */
'use strict';

const database = require('../../lib/database');
const permissions = require('../../lib/permissions');
const { manageRoles } = require('../../lib/constants');
const { searchKnowledgeBase } = require('./knowledgeBase');

const MAX_LIST_ITEMS = 8;
const MAX_SEARCH_VALUE_LENGTH = 120;

const CHAT_INTENTS = Object.freeze({
  HELP: 'help',
  MY_DATA: 'my_data',
  SUMMARY: 'summary',
  RISK: 'at_risk_students',
  SEARCH: 'student_search',
  KNOWLEDGE: 'knowledge',
  MUTATION: 'mutation_not_allowed',
  UNSUPPORTED: 'unsupported'
});

const MANAGEMENT_ROLES = new Set(manageRoles);

class ChatAuthorizationError extends Error {
  constructor(message = 'Sessão inválida ou expirada.') {
    super(message);
    this.name = 'ChatAuthorizationError';
    this.code = 'unauthorized';
    this.statusCode = 401;
  }
}

function toText(value) {
  return String(value ?? '').trim();
}

function toSafeText(value) {
  const text = toText(value);
  return text || null;
}

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(1)) : null;
}

function normalizeForIntent(value) {
  return toText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function hasAuthenticatedIdentity(user) {
  return Boolean(user && typeof user === 'object' && toText(user.role));
}

/** Returns only the server-known scope that is useful to a client UI. */
function buildScope(user) {
  const role = toText(user?.role) || 'Desconhecido';

  if (role === 'Admin') return { role, access: 'global' };
  if (role === 'Diretor') {
    return { role, access: 'curso', curso: toSafeText(user.curso) };
  }
  if (role === 'Professor') {
    return {
      role,
      access: 'turma',
      curso: toSafeText(user.curso),
      disciplina: toSafeText(user.disciplina),
      turma: toSafeText(user.turma)
    };
  }
  if (role === 'Aluno') return { role, access: 'proprio' };

  return { role, access: 'nenhum' };
}

function isAtRisk(student) {
  const status = normalizeForIntent(student?.situacao_risco);
  return status.includes('risco') || student?.risco_nota === true || student?.risco_faltas === true;
}

/**
 * Whitelists response fields. In particular, telephone, description, account
 * data and the raw subject JSON are never forwarded to a model or response.
 */
function toSafeStudent(student, { includeSubjects = false } = {}) {
  const safeStudent = {
    matricula: toSafeText(student?.matricula),
    nome: toSafeText(student?.nome),
    curso: toSafeText(student?.curso),
    disciplina: toSafeText(student?.disciplina),
    turma: toSafeText(student?.turma),
    notaFinal: toSafeNumber(student?.nota_final),
    percentualFaltas: toSafeNumber(student?.taxa_faltas),
    situacaoRisco: toSafeText(student?.situacao_risco) || 'Não informado'
  };

  if (includeSubjects) {
    safeStudent.disciplinas = (Array.isArray(student?.subjects) ? student.subjects : [])
      .slice(0, MAX_LIST_ITEMS)
      .map((subject) => ({
        nome: toSafeText(subject?.name) || 'Disciplina',
        nota: toSafeNumber(subject?.nota),
        percentualFaltas: toSafeNumber(subject?.percentual_faltas),
        situacaoRisco: toSafeText(subject?.situacao_risco) || 'Não informado'
      }));
  }

  return safeStudent;
}

function buildStatistics(students) {
  const totals = {
    alunos: students.length,
    emRisco: 0,
    alerta: 0,
    regular: 0,
    mediaNotas: null,
    mediaFaltasPercentual: null
  };
  let totalNotas = 0;
  let notasValidas = 0;
  let totalFaltas = 0;
  let faltasValidas = 0;

  for (const student of students) {
    const status = normalizeForIntent(student?.situacao_risco);
    if (isAtRisk(student)) totals.emRisco += 1;
    else if (status.includes('alerta') || student?.alerta_nota === true || student?.alerta_faltas === true) totals.alerta += 1;
    else totals.regular += 1;

    const grade = Number(student?.nota_final);
    if (Number.isFinite(grade)) {
      totalNotas += grade;
      notasValidas += 1;
    }

    const absences = Number(student?.taxa_faltas);
    if (Number.isFinite(absences)) {
      totalFaltas += absences;
      faltasValidas += 1;
    }
  }

  if (notasValidas > 0) totals.mediaNotas = Number((totalNotas / notasValidas).toFixed(1));
  if (faltasValidas > 0) totals.mediaFaltasPercentual = Number((totalFaltas / faltasValidas).toFixed(1));
  return totals;
}

function formatMetric(value, suffix = '') {
  return value === null || value === undefined ? 'não informada' : `${value}${suffix}`;
}

function formatStudentList(students) {
  if (students.length === 0) return '';
  return students
    .map((student) => {
      const identifier = student.matricula ? ` (${student.matricula})` : '';
      return `${student.nome || 'Aluno'}${identifier}: nota ${formatMetric(student.notaFinal)}, faltas ${formatMetric(student.percentualFaltas, '%')}, ${student.situacaoRisco}.`;
    })
    .join(' ');
}

function helpMessage(user) {
  const role = toText(user?.role);
  const commands = ['"meus dados"', '"meu desempenho"', '"buscar matrícula: 2024001"', '"buscar nome: Ana"'];

  if (role !== 'Aluno') commands.push('"resumo" ou "estatísticas"');
  if (MANAGEMENT_ROLES.has(role)) commands.push('"alunos em risco"');

  return `Posso ajudar com ${commands.join(', ')}. Consultas são somente de leitura e respeitam o seu escopo de acesso.`;
}

function makeResult({ intent, scope, sources = [], context = null, fallbackMessage, useAi = true }) {
  return {
    intent,
    scope,
    sources,
    context,
    fallbackMessage,
    useAi
  };
}

function hasMutationRequest(normalizedMessage) {
  // Commands that would change SGAC state are intentionally not implemented.
  return /\b(cadastrar|criar|adicionar|inserir|editar|alterar|atualizar|remover|excluir|apagar|movimentar|salvar|resetar|trocar)\b/.test(normalizedMessage);
}

function sanitizeSearchValue(value) {
  const text = toText(value).replace(/^['"]|['"]$/g, '').trim();
  if (!text) return { error: 'Informe um valor para a busca.' };
  if (Array.from(text).length > MAX_SEARCH_VALUE_LENGTH) {
    return { error: `A busca deve ter no máximo ${MAX_SEARCH_VALUE_LENGTH} caracteres.` };
  }
  return { value: text };
}

/**
 * Recognizes only explicit name or matrícula searches. Free-form text is not
 * silently converted into a broad search, which keeps results predictable.
 */
function parseSearchCommand(message) {
  const matriculaPatterns = [
    /\b(?:buscar|busque|pesquisar|procure|encontrar|localizar)\s+(?:aluno\s+)?(?:por\s+)?matr[ií]cula\s*(?:[:=]|(?:e|é)\s+)?(.+)$/i,
    /\bmatr[ií]cula\s*(?:[:=]|(?:e|é)\s+)(.+)$/i
  ];
  const namePatterns = [
    /\b(?:buscar|busque|pesquisar|procure|encontrar|localizar)\s+(?:aluno\s+)?(?:por\s+)?nome\s*(?:[:=]|(?:e|é)\s+)?(.+)$/i,
    /\b(?:buscar|busque|pesquisar|procure|encontrar|localizar)\s+aluno\s+(.+)$/i
  ];

  for (const pattern of matriculaPatterns) {
    const match = message.match(pattern);
    if (match) return { type: 'matricula', ...sanitizeSearchValue(match[1]) };
  }
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match) return { type: 'nome', ...sanitizeSearchValue(match[1]) };
  }
  return null;
}

function classifyIntent(message) {
  const normalized = normalizeForIntent(message);

  if (hasMutationRequest(normalized)) return { intent: CHAT_INTENTS.MUTATION };

  const search = parseSearchCommand(message);
  if (search) return { intent: CHAT_INTENTS.SEARCH, search };

  if (/\b(alunos?\s+)?(em\s+)?risco\b/.test(normalized)) {
    return { intent: CHAT_INTENTS.RISK };
  }
  if (/\b(meus?\s+(dados|desempenho|notas?|faltas?)|minha\s+(situacao|situação|media|média|nota|frequencia|frequência)|meu\s+perfil)\b/.test(normalized)) {
    return { intent: CHAT_INTENTS.MY_DATA };
  }
  if (/\b(resumo|estatisticas|estatistica|indicadores|dashboard|quantos\s+alunos)\b/.test(normalized)) {
    return { intent: CHAT_INTENTS.SUMMARY };
  }
  if (/^(oi|ola|olá|ajuda|help|comandos?|o\s+que\s+voce\s+faz|o\s+que\s+você\s+faz)\b/.test(normalized)) {
    return { intent: CHAT_INTENTS.HELP };
  }

  const knowledge = searchKnowledgeBase(message);
  return knowledge.length
    ? { intent: CHAT_INTENTS.KNOWLEDGE, knowledge }
    : { intent: CHAT_INTENTS.UNSUPPORTED };
}

class ChatCommandController {
  constructor({ databaseApi = database, permissionApi = permissions } = {}) {
    if (typeof databaseApi.fetchVisibleStudents !== 'function' || typeof databaseApi.getVisibleStudentByMatricula !== 'function') {
      throw new TypeError('As funções de leitura autorizada do banco são obrigatórias.');
    }
    if (typeof permissionApi.canAccessStudent !== 'function') {
      throw new TypeError('A função de permissão canAccessStudent é obrigatória.');
    }

    this.database = databaseApi;
    this.permissions = permissionApi;
  }

  /**
   * Uses a session-shaped object populated exclusively from the authenticated
   * server user. No value received in the message can affect this scope.
   */
  async getScopedStudents(user, query = {}) {
    const data = await this.database.fetchVisibleStudents({
      // Chat answers describe the current academic record.  A period snapshot
      // is an audit view and must never silently replace a recently edited
      // grade, attendance count, or risk status in a conversational answer.
      // Keep this value server-owned even if a future caller supplies a query.
      query: { ...query, fonte: 'atual' },
      session: { user }
    });
    const visibleStudents = Array.isArray(data?.alunos) ? data.alunos : [];
    const alunos = visibleStudents.filter((student) => this.permissions.canAccessStudent(user, student));

    return {
      alunos,
      periodIndex: Number.isInteger(data?.periodIndex) ? data.periodIndex : 0,
      currentPeriodName: toSafeText(data?.currentPeriodName) || 'Período atual',
      dataSource: toSafeText(data?.dataSource) || 'atual'
    };
  }

  async getOwnStudent(user) {
    if (user.role !== 'Aluno' || !toText(user.matricula)) return null;

    // The default individual reader is intentionally period-oriented so UI
    // screens can open a closed bulletin. The chat is a live assistance
    // surface, therefore it always asks for the current source explicitly.
    const student = await this.database.getVisibleStudentByMatricula(
      user,
      user.matricula,
      0,
      { source: 'atual' }
    );
    return student && this.permissions.canAccessStudent(user, student) ? student : null;
  }

  async execute(user, message) {
    if (!hasAuthenticatedIdentity(user)) throw new ChatAuthorizationError();

    const scope = buildScope(user);
    const command = classifyIntent(message);

    if (command.intent === CHAT_INTENTS.MUTATION) {
      return makeResult({
        intent: command.intent,
        scope,
        fallbackMessage: 'Por segurança, este chat não cria, edita, remove ou movimenta dados. Use as telas autorizadas do SGAC para alterações.',
        useAi: false
      });
    }

    if (command.intent === CHAT_INTENTS.KNOWLEDGE) {
      return makeResult({
        intent: command.intent,
        scope,
        sources: command.knowledge.map((item) => item.source),
        context: {
          tipo: 'orientacao_local',
          artigos: command.knowledge.map(({ title, answer, url }) => ({ title, answer, url }))
        },
        fallbackMessage: command.knowledge.map((item) => item.answer).join('\n\n'),
        useAi: true
      });
    }

    if (command.intent === CHAT_INTENTS.HELP || command.intent === CHAT_INTENTS.UNSUPPORTED) {
      return makeResult({
        intent: command.intent,
        scope,
        fallbackMessage: command.intent === CHAT_INTENTS.HELP
          ? helpMessage(user)
          : `Não reconheci essa consulta. ${helpMessage(user)}`,
        useAi: false
      });
    }

    if (command.intent === CHAT_INTENTS.MY_DATA) {
      if (user.role !== 'Aluno') {
        return makeResult({
          intent: command.intent,
          scope,
          fallbackMessage: 'A consulta "meus dados" está disponível para o perfil de aluno. Use resumo, busca por nome ou matrícula conforme o seu escopo.',
          useAi: false
        });
      }

      const student = await this.getOwnStudent(user);
      if (!student) {
        return makeResult({
          intent: command.intent,
          scope,
          sources: ['alunos'],
          context: { tipo: 'dados_proprios', aluno: null },
          fallbackMessage: 'Não encontrei um cadastro acadêmico vinculado à sua sessão.',
          useAi: false
        });
      }

      const aluno = toSafeStudent(student, { includeSubjects: true });
      return makeResult({
        intent: command.intent,
        scope,
        sources: ['alunos'],
        context: { tipo: 'dados_proprios', aluno },
        fallbackMessage: `Seu desempenho: nota final ${formatMetric(aluno.notaFinal)}, faltas ${formatMetric(aluno.percentualFaltas, '%')} e situação ${aluno.situacaoRisco}.`
      });
    }

    if (command.intent === CHAT_INTENTS.SUMMARY) {
      // A student receives only an aggregate of their own record; staff gets
      // aggregates only from records already filtered to its server scope.
      if (user.role === 'Aluno') {
        const student = await this.getOwnStudent(user);
        if (!student) {
          return makeResult({
            intent: command.intent,
            scope,
            sources: ['alunos'],
            context: { tipo: 'resumo_proprio', totais: buildStatistics([]) },
            fallbackMessage: 'Não encontrei dados acadêmicos vinculados à sua sessão.',
            useAi: false
          });
        }

        const totals = buildStatistics([student]);
        return makeResult({
          intent: command.intent,
          scope,
          sources: ['alunos'],
          context: { tipo: 'resumo_proprio', totais: totals },
          fallbackMessage: `Seu resumo: nota final ${formatMetric(totals.mediaNotas)}, faltas ${formatMetric(totals.mediaFaltasPercentual, '%')} e ${totals.emRisco ? 'situação de risco' : (totals.alerta ? 'situação de alerta' : 'situação regular')}.`
        });
      }

      const data = await this.getScopedStudents(user);
      const totals = buildStatistics(data.alunos);
      return makeResult({
        intent: command.intent,
        scope,
        sources: ['alunos'],
        context: {
          tipo: 'resumo',
          periodo: { indice: data.periodIndex, nome: data.currentPeriodName, origem: data.dataSource },
          totais: totals
        },
        fallbackMessage: `Resumo do seu escopo: ${totals.alunos} aluno(s), ${totals.emRisco} em risco, ${totals.alerta} em alerta, média de notas ${formatMetric(totals.mediaNotas)} e média de faltas ${formatMetric(totals.mediaFaltasPercentual, '%')}.`
      });
    }

    if (command.intent === CHAT_INTENTS.RISK) {
      if (!MANAGEMENT_ROLES.has(user.role)) {
        return makeResult({
          intent: command.intent,
          scope,
          fallbackMessage: 'A lista de alunos em risco é disponível apenas para perfis com gestão acadêmica.',
          useAi: false
        });
      }

      const data = await this.getScopedStudents(user);
      const atRisk = data.alunos.filter(isAtRisk);
      const alunos = atRisk.slice(0, MAX_LIST_ITEMS).map((student) => toSafeStudent(student));
      const omitted = Math.max(0, atRisk.length - alunos.length);
      const listText = alunos.length ? ` ${formatStudentList(alunos)}` : '';
      const omittedText = omitted ? ` Há mais ${omitted} aluno(s) no resultado, não exibido(s) nesta resposta.` : '';

      return makeResult({
        intent: command.intent,
        scope,
        sources: ['alunos'],
        context: {
          tipo: 'alunos_em_risco',
          periodo: { indice: data.periodIndex, nome: data.currentPeriodName, origem: data.dataSource },
          total: atRisk.length,
          alunos
        },
        fallbackMessage: atRisk.length
          ? `Encontrei ${atRisk.length} aluno(s) em risco no seu escopo.${listText}${omittedText}`
          : 'Não há alunos em risco no seu escopo para o período consultado.'
      });
    }

    if (command.intent === CHAT_INTENTS.SEARCH) {
      if (command.search.error) {
        return makeResult({
          intent: command.intent,
          scope,
          fallbackMessage: command.search.error,
          useAi: false
        });
      }

      const query = command.search.type === 'matricula'
        ? { busca_matricula: command.search.value }
        : { busca_nome: command.search.value };
      const data = await this.getScopedStudents(user, query);
      const alunos = data.alunos.slice(0, MAX_LIST_ITEMS).map((student) => toSafeStudent(student));
      const omitted = Math.max(0, data.alunos.length - alunos.length);
      const listText = alunos.length ? ` ${formatStudentList(alunos)}` : '';
      const omittedText = omitted ? ` Há mais ${omitted} aluno(s) no resultado, não exibido(s) nesta resposta.` : '';
      const criterion = command.search.type === 'matricula' ? 'matrícula' : 'nome';

      return makeResult({
        intent: command.intent,
        scope,
        sources: ['alunos'],
        context: {
          tipo: 'busca',
          criterio: criterion,
          termo: command.search.value,
          periodo: { indice: data.periodIndex, nome: data.currentPeriodName, origem: data.dataSource },
          total: data.alunos.length,
          alunos
        },
        fallbackMessage: alunos.length
          ? `Encontrei ${data.alunos.length} aluno(s) no seu escopo pela ${criterion}.${listText}${omittedText}`
          : `Não encontrei alunos no seu escopo pela ${criterion} informada.`
      });
    }

    // Kept as a safe future-proof fallback if a new intent is added above.
    return makeResult({
      intent: CHAT_INTENTS.UNSUPPORTED,
      scope,
      fallbackMessage: `Não reconheci essa consulta. ${helpMessage(user)}`,
      useAi: false
    });
  }
}

module.exports = {
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
};

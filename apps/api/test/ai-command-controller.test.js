/**
 * Unit checks for the isolated assistant command boundary. The tests use
 * injected in-memory readers, so no real academic record is read or changed.
 */
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createChatController } = require('../src/modules/ai/chatController');
const { validateChatDto } = require('../src/modules/ai/chatDto');
const { ChatCommandController } = require('../src/modules/ai/commandController');
const { AiChatService, getLocalAiEndpoint } = require('../src/modules/ai/aiService');

function responseRecorder() {
  return {
    code: null,
    body: null,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('o DTO do chat recusa campos que poderiam ampliar permissões', () => {
  assert.deepEqual(validateChatDto({ message: 'Resumo' }), { message: 'Resumo' });
  assert.throws(
    () => validateChatDto({ message: 'Resumo', role: 'Admin' }),
    /apenas o campo "message"/i
  );
});

test('uma busca do chat mantém escopo do servidor e remove campos sensíveis', async () => {
  const user = {
    id: 17,
    role: 'Diretor',
    curso: 'Engenharia',
    username: 'diretora'
  };
  let receivedRequest = null;
  const controller = new ChatCommandController({
    databaseApi: {
      async fetchVisibleStudents(request) {
        receivedRequest = request;
        return {
          alunos: [
            {
              matricula: '2024001',
              nome: 'Ana Autorizada',
              curso: 'Engenharia',
              turma: 'A',
              nota_final: 8.2,
              taxa_faltas: 4,
              situacao_risco: 'Regular',
              telefone: '99999-9999',
              descricao: 'Dado que não pode sair no chat'
            },
            {
              matricula: '2024999',
              nome: 'Registro fora do escopo',
              curso: 'Outro curso',
              telefone: '00000-0000'
            }
          ],
          periodIndex: 0,
          currentPeriodName: '1º período',
          dataSource: 'atual'
        };
      },
      async getVisibleStudentByMatricula() {
        return null;
      }
    },
    permissionApi: {
      canAccessStudent(currentUser, student) {
        return currentUser.curso === student.curso;
      }
    }
  });

  const result = await controller.execute(user, 'Buscar por matrícula: 2024001');

  assert.equal(receivedRequest.session.user, user);
  assert.equal(receivedRequest.query.busca_matricula, '2024001');
  assert.equal(receivedRequest.query.fonte, 'atual');
  assert.equal(result.context.alunos.length, 1);
  assert.equal(result.context.alunos[0].matricula, '2024001');
  assert.equal('telefone' in result.context.alunos[0], false);
  assert.equal('descricao' in result.context.alunos[0], false);
  assert.doesNotMatch(result.fallbackMessage, /99999-9999|fora do escopo/i);
});

test('o chat do aluno usa dados atuais mesmo quando existe boletim histórico', async () => {
  const user = {
    id: 24,
    role: 'Aluno',
    matricula: '2024017',
    nome: 'Joana Atualizada'
  };
  let readerOptions = null;
  const controller = new ChatCommandController({
    databaseApi: {
      async fetchVisibleStudents() {
        return { alunos: [] };
      },
      async getVisibleStudentByMatricula(currentUser, matricula, periodIndex, options) {
        assert.equal(currentUser, user);
        assert.equal(matricula, user.matricula);
        assert.equal(periodIndex, 0);
        readerOptions = options;

        // This reader deliberately models a closed snapshot with a stale
        // grade. The command must select the live value instead.
        return options?.source === 'atual'
          ? {
            matricula,
            nome: user.nome,
            nota_final: 8.5,
            taxa_faltas: 12.5,
            situacao_risco: 'Regular',
            subjects: []
          }
          : {
            matricula,
            nome: user.nome,
            nota_final: 6,
            taxa_faltas: 10,
            situacao_risco: 'Em risco',
            subjects: []
          };
      }
    },
    permissionApi: {
      canAccessStudent(currentUser, student) {
        return currentUser.matricula === student.matricula;
      }
    }
  });

  const result = await controller.execute(user, 'Meus dados');

  assert.deepEqual(readerOptions, { source: 'atual' });
  assert.equal(result.context.aluno.notaFinal, 8.5);
  assert.equal(result.context.aluno.situacaoRisco, 'Regular');
  assert.match(result.fallbackMessage, /8\.5/);
  assert.doesNotMatch(result.fallbackMessage, /em risco/i);
});

test('comandos de alteração são recusados antes de consultar o banco', async () => {
  let reads = 0;
  const controller = new ChatCommandController({
    databaseApi: {
      async fetchVisibleStudents() {
        reads += 1;
        return { alunos: [] };
      },
      async getVisibleStudentByMatricula() {
        reads += 1;
        return null;
      }
    },
    permissionApi: { canAccessStudent: () => false }
  });

  const result = await controller.execute({ id: 1, role: 'Admin' }, 'Excluir o aluno 2024001');

  assert.equal(result.intent, 'mutation_not_allowed');
  assert.equal(reads, 0);
  assert.match(result.fallbackMessage, /não cria, edita, remove/i);
});

test('a assistente responde perguntas livres de acessibilidade com fonte local', async () => {
  let reads = 0;
  const controller = new ChatCommandController({
    databaseApi: {
      async fetchVisibleStudents() {
        reads += 1;
        return { alunos: [] };
      },
      async getVisibleStudentByMatricula() {
        reads += 1;
        return null;
      }
    },
    permissionApi: { canAccessStudent: () => false }
  });

  const result = await controller.execute(
    { id: 1, role: 'Aluno' },
    'Como posso usar o sistema sem mouse e com o teclado?'
  );

  assert.equal(result.intent, 'knowledge');
  assert.equal(result.useAi, true);
  assert.match(result.fallbackMessage, /Tab e Shift\+Tab/);
  assert.deepEqual(result.sources, ['Keyboard — WCAG 2.2 — W3C']);
  assert.equal(reads, 0);
});

test('a assistente orienta onde ativar as preferencias de acessibilidade do SGAC', async () => {
  const controller = new ChatCommandController({
    databaseApi: {
      async fetchVisibleStudents() {
        assert.fail('orientacao de acessibilidade nao deve consultar alunos');
      },
      async getVisibleStudentByMatricula() {
        assert.fail('orientacao de acessibilidade nao deve consultar matriculas');
      }
    },
    permissionApi: { canAccessStudent: () => false }
  });

  const result = await controller.execute(
    { id: 1, role: 'Aluno' },
    'Ativar acessibilidade'
  );

  assert.equal(result.intent, 'knowledge');
  assert.match(result.fallbackMessage, /Configurações.*Acessibilidade/);
  assert.match(result.fallbackMessage, /alto contraste/);
});

test('a geracao opcional usa apenas um modelo local e recebe o contexto autorizado', async () => {
  let requestBody = null;
  const service = new AiChatService({
    commandController: {
      async execute() {
        return {
          intent: 'knowledge',
          scope: { role: 'Aluno', access: 'proprio' },
          sources: ['WCAG 2.2 — W3C'],
          context: { artigos: [{ title: 'Teclado', answer: 'Use Tab para navegar.' }] },
          fallbackMessage: 'Use Tab para navegar.',
          useAi: true
        };
      }
    },
    environment: { LOCAL_AI_MODEL: 'qwen2.5:3b' },
    fetchImplementation: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/chat');
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return { message: { content: 'Percorra os controles usando Tab.' } };
        }
      };
    }
  });

  const response = await service.respond({ user: { id: 1, role: 'Aluno' }, message: 'Como navego pelo teclado?' });

  assert.equal(response.mode, 'local-model');
  assert.equal(response.message, 'Percorra os controles usando Tab.');
  assert.equal(requestBody.stream, false);
  assert.equal('tools' in requestBody, false);
  assert.match(requestBody.messages[1].content, /CONTEXTO AUTORIZADO/);
  assert.equal(getLocalAiEndpoint({ LOCAL_AI_URL: 'https://example.com/api/chat' }), null);
  assert.equal(getLocalAiEndpoint({ LOCAL_AI_URL: 'http://127.0.0.1:11434/api/chat' }), 'http://127.0.0.1:11434/api/chat');
});

test('pergunta sem correspondencia nao consulta dados nem inventa uma resposta', async () => {
  const controller = new ChatCommandController({
    databaseApi: {
      async fetchVisibleStudents() {
        assert.fail('pergunta fora do escopo nao deve consultar alunos');
      },
      async getVisibleStudentByMatricula() {
        assert.fail('pergunta fora do escopo nao deve consultar matriculas');
      }
    },
    permissionApi: { canAccessStudent: () => false }
  });

  const result = await controller.execute({ id: 1, role: 'Aluno' }, 'Qual filme ganhou o Oscar?');

  assert.equal(result.intent, 'unsupported');
  assert.equal(result.useAi, false);
  assert.match(result.fallbackMessage, /Não reconheci essa consulta/);
});

test('a rota do chat mantém o envelope padrão da API', async () => {
  const handler = createChatController({
    chatService: {
      async respond() {
        return {
          message: 'Resumo autorizado.',
          mode: 'contextual',
          intent: 'summary',
          sources: ['alunos'],
          scope: { role: 'Aluno', access: 'proprio' }
        };
      }
    }
  });
  const res = responseRecorder();

  await handler(
    { body: { message: 'Resumo' }, session: { user: { id: 3, role: 'Aluno' } } },
    res
  );

  assert.equal(res.code, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.message, 'Resumo autorizado.');
  assert.deepEqual(res.body.data.scope, { role: 'Aluno', access: 'proprio' });
});

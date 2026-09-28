# SGAC — Sistema de Gerenciamento de Alunos Cotistas

O SGAC acompanha estudantes cotistas com acesso restrito por perfil, busca paginada, indicadores acadêmicos e um assistente de IA que só consulta dados autorizados para a sessão atual.

## Estrutura

```text
apps/
  api/                 API Express, autenticação e regras de negócio
    src/modules/
      students/        DTO, controller e serviço de busca de alunos
      ai/              DTO, controlador de comandos e serviço de IA
  web/                 Aplicação React/Vite
    src/features/      DTOs de tela e recursos independentes, como o chat
database/              Diretório local do SQLite (somente .gitkeep é versionado)
```

O navegador nunca fala diretamente com SQLite ou com o provedor de IA. A API obtém a identidade da sessão, aplica a regra de escopo e só então consulta os dados ou prepara o contexto permitido para o assistente.

## Execução

Requer Node.js 20.19 LTS ou 22.12 ou superior.

```powershell
npm install
npm --prefix apps/web install
```

Para desenvolvimento, execute `npm run dev` em um terminal e `npm run client:dev` em outro. A interface Vite usa proxy para a API local.

## Banco local e primeiro administrador

O repositório não inclui banco SQLite, backup, sessões ou fotos de perfil. Cada pessoa cria seu próprio arquivo local em `database/escola.db`; o servidor cria o diretório, as tabelas, índices e gatilhos automaticamente na primeira execução.

Antes de abrir o sistema pela primeira vez, crie o administrador inicial. Escolha uma senha real, sem registrá-la no Git:

```powershell
$env:INITIAL_ADMIN_USERNAME = 'admin-local'
$env:INITIAL_ADMIN_PASSWORD = 'troque-por-uma-senha-forte'
$env:INITIAL_ADMIN_NAME = 'Administrador local'
npm run create:admin
```

Depois execute `npm run quickstart`. O comando de criação só funciona quando ainda não há uma conta `Admin`; as demais contas devem ser cadastradas na tela de permissões. Para manter o banco fora da pasta do projeto, defina `DATABASE_PATH` com um caminho absoluto antes de executar os comandos. Os testes já usam bancos temporários isolados e não dependem do banco local.

## Assistente SGAC

A assistente aceita perguntas em linguagem natural sobre acessibilidade e uso do sistema, além de consultas acadêmicas autorizadas. O conhecimento institucional fica versionado no servidor em `apps/api/src/modules/ai/knowledgeBase.js`. Consultas acadêmicas continuam somente leitura, com identidade e escopo derivados da sessão autenticada. O chat não persiste histórico.

Sem modelo instalado, as respostas usam a base local revisada. Para redigir respostas específicas com um modelo local, instale [Ollama](https://ollama.com/download), baixe um modelo e configure no ambiente do servidor:

```powershell
ollama pull qwen2.5:3b
$env:LOCAL_AI_MODEL = 'qwen2.5:3b'
npm run dev
```

O servidor chama apenas `http://127.0.0.1:11434/api/chat`; o código recusa endpoints externos. A pergunta e o contexto autorizado não são enviados a serviços remotos. Sem Ollama, indisponibilidade do modelo ou resposta inválida, a resposta revisada da base local continua disponível. Consulte [Acessibilidade](ACCESSIBILITY.md) para critérios, limites e referências.

## Segurança e arquitetura

- DTOs validam entradas da busca e do chat na API; os DTOs React normalizam respostas antes da renderização.
- A autorização é aplicada no servidor a cada chamada, usando função, curso, turma, disciplina e matrícula quando necessários.
- O módulo de IA não recebe o banco inteiro e não executa comandos de alteração.
- A busca retorna no máximo 50 registros por página e usa índices para escopos acadêmicos e nome.

A organização foi baseada na separação de componentes e fluxo de dados recomendada pelo [React](https://react.dev/learn/thinking-in-react), em rotas modulares do [Express](https://expressjs.com/en/guide/routing.html) e em contratos documentáveis pela [OpenAPI Specification](https://spec.openapis.org/oas/latest.html). O controle de dados segue o princípio de menor privilégio, negação por padrão e validação no servidor do [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

## Referências aplicadas

O [vídeo de referência fornecido](https://youtu.be/_gHr2Pe5LCY?is=fToJ7OVVSTdyI8ds) inspirou a separação entre componentes React, cliente de API e rotas do servidor. A implementação aproveita esse padrão sem permitir que o navegador acesse o SQLite diretamente: DTOs delimitam o contrato, controladores coordenam cada caso de uso e o banco fica atrás da API. Para permissões por atributos de sessão, também foi adotada a noção de escopo do [NIST SP 800-162 sobre ABAC](https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-162.pdf), aplicada junto às regras existentes de papel, curso, disciplina, turma e matrícula.

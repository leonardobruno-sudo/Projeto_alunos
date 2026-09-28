# SGAC — Sistema de Gerenciamento de Alunos Cotistas

O SGAC é uma aplicação web para cadastro, acompanhamento acadêmico e gestão de estudantes cotistas. A interface é React/TypeScript; a API é Express/Node.js e persiste os dados em SQLite local. A API é a fronteira de autenticação e autorização: o navegador não acessa o banco diretamente.

## O que o sistema faz

- Mantém cadastro de estudantes, matrícula, curso, turma, cotas, matérias, notas, frequência e indicadores acadêmicos.
- Permite pesquisar e filtrar estudantes dentro do escopo de cada perfil; administradores também podem importar cadastros por CSV.
- Apresenta dashboard, estatísticas, gráficos e dados por matéria.
- Salva snapshots acadêmicos por período para consulta histórica, sem substituir os dados atuais.
- Permite que professores atualizem somente a nota e a frequência da matéria atribuída.
- Oferece gestão de contas e permissões, alteração de senha, foto de perfil e backup administrativo.
- Inclui assistente somente de leitura para orientação do SGAC, acessibilidade e consultas acadêmicas autorizadas.
- Oferece preferências visuais de alto contraste, texto ampliado e movimento reduzido.

## Perfis e acesso

| Perfil | Escopo de consulta | Ações principais |
| --- | --- | --- |
| Admin | Todos os estudantes | Gerencia contas, cadastros, CSV, períodos e backup |
| Diretor | Estudantes do próprio curso | Gerencia estudantes dentro do curso |
| Professor | Próprio curso, turma e matéria atribuída | Consulta estudantes do escopo e edita somente sua matéria |
| Aluno | Apenas o próprio cadastro, pela matrícula | Consulta seus dados e desempenho |

O servidor deriva identidade e escopo da sessão autenticada. Filtros enviados pelo navegador não ampliam permissões. A exportação CSV é exclusiva de Admin; contas de aluno são provisionadas junto ao cadastro e não são gerenciadas como contas comuns de equipe.

## Organização do código

```text
apps/
  api/
    src/lib/          Banco, autenticação, sessão, permissões e utilitários
    src/modules/      Casos de uso de alunos e assistente
    src/routes/       Rotas HTTP da API
    test/             Testes Node.js da API e regras de negócio
  web/
    src/components/   Componentes React reutilizáveis
    src/features/     Funcionalidades isoladas, como chat
    src/pages/        Dashboard, estatísticas, cadastro e configurações
database/             Local reservado ao SQLite de cada instalação
```

O schema é inicializado e atualizado por `apps/api/src/lib/database.js`. As tabelas principais são `alunos`, `usuarios`, `historico_academico`, `sessoes` e `movimentacoes`. Índices apoiam buscas normalizadas por matrícula/nome e filtros por curso, turma e matéria. Excluir um cadastro remove a conta estudantil vinculada; snapshots históricos são preservados.

## API

Todas as rotas de dados ficam sob `/api`; as rotas protegidas exigem sessão autenticada.

| Rota | Finalidade |
| --- | --- |
| `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` | Login, sessão atual e encerramento |
| `/api/auth/password`, `/api/auth/profile/photo` | Senha e foto de perfil |
| `/api/alunos` | Listagem paginada e cadastro conforme permissão |
| `/api/alunos/importar`, `/api/alunos/modelo.csv` | Importação e modelo CSV, exclusivos de Admin |
| `/api/alunos/:matricula` | Consulta do cadastro dentro do escopo |
| `/api/alunos/:matricula/materias/:subject` | Atualização da matéria autorizada do professor |
| `/api/periodos`, `/api/periodos/:periodo/historico` | Períodos; snapshots históricos são salvos por Admin |
| `/api/estatisticas`, `/api/materia/:index` | Indicadores e consulta por matéria com escopo aplicado |
| `/api/usuarios` | Gestão de contas de equipe, exclusiva de Admin |
| `/api/backup` | Backup do banco, exclusivo de Admin |
| `/api/chat` | Assistente de leitura, limitada à sessão e às permissões existentes |

## Instalação e execução

Requer Node.js `20.19.x` ou `22.12+`.

```powershell
npm install
npm --prefix apps/web install
```

Crie o primeiro administrador em um banco vazio. Use uma senha própria e não a coloque em arquivos versionados:

```powershell
$env:INITIAL_ADMIN_USERNAME = 'admin-local'
$env:INITIAL_ADMIN_PASSWORD = 'troque-por-uma-senha-forte'
$env:INITIAL_ADMIN_NAME = 'Administrador local'
npm run create:admin
```

Depois, `npm run quickstart` compila a interface e inicia o sistema. Para desenvolvimento separado, execute `npm run dev` e `npm run client:dev` em terminais diferentes. A interface Vite encaminha `/api` para a API local.

Por padrão, o banco é `database/escola.db`, criado localmente na primeira execução. Para usar outro caminho, configure `DATABASE_PATH` com um caminho absoluto. Bancos, backups, sessões e fotos de perfil não são versionados. Em produção, configure `SESSION_SECRET` e HTTPS.

## Assistente e privacidade

O conteúdo institucional e as orientações sobre acessibilidade ficam versionados em `apps/api/src/modules/ai/knowledgeBase.js`. O controlador reconhece consultas acadêmicas permitidas, busca conteúdo local e recusa alterações. Perguntas fora dos assuntos conhecidos não recebem respostas inventadas.

Sem modelo local, o assistente usa respostas revisadas. Opcionalmente, o servidor pode usar Ollama:

```powershell
ollama pull qwen2.5:3b
$env:LOCAL_AI_MODEL = 'qwen2.5:3b'
npm run dev
```

O código aceita apenas o endpoint local `127.0.0.1:11434`; não envia perguntas ou contexto a serviços remotos. O modelo pode redigir uma resposta a partir do contexto já autorizado, mas não recebe ferramentas para consultar ou alterar o banco. O chat não persiste histórico. Sem Ollama ou se ele falhar, permanece disponível a resposta local.

## Acessibilidade

A meta de desenvolvimento é WCAG 2.2 AA; isso não representa certificação. As configurações incluem contraste alto, texto ampliado e movimento reduzido. Acessibilidade também depende de testes manuais com teclado, leitores de tela, zoom/reflow e pessoas com deficiência. Veja [ACCESSIBILITY.md](ACCESSIBILITY.md) para critérios e referências.

## Testes e CI

```powershell
npm test
npm run lint
npm run build
npm audit
```

O GitHub Actions executa testes, lint e build em pushes e pull requests. O fluxo de branches e a revisão estão descritos em [CONTRIBUTING.md](CONTRIBUTING.md).

## Relatórios técnicos

Este README é a documentação principal do sistema no Git. Os DOCX de `entregaveis/` são documentos derivados, não fonte de verdade, e ficam fora do versionamento para evitar cópias desatualizadas e binários no repositório. Os antigos geradores `.tmp_relatorio_*` eram temporários e dependiam de caminhos locais; não fazem parte do fluxo de build do SGAC.

## Como manter este README

Atualize a seção afetada quando mudar uma permissão, endpoint, tabela, comando, configuração ou funcionalidade. Confira primeiro o código e os testes; descreva somente o comportamento implementado, diferencie claramente limitações de planos futuros e execute os comandos de validação acima.

Para pedir uma revisão ou atualização assistida por IA, use este roteiro:

```text
Revise o README.md comparando cada afirmação com o código e os testes atuais.
Atualize apenas os trechos afetados pela mudança descrita. Não invente recursos,
permissões, dados ou conformidade. Indique as fontes no repositório que sustentam
cada alteração e liste dúvidas que precisem de confirmação humana.
```

## Referências

- [React: Thinking in React](https://react.dev/learn/thinking-in-react)
- [Express: Routing](https://expressjs.com/en/guide/routing.html)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [WCAG 2.2 Quick Reference — W3C](https://www.w3.org/WAI/WCAG22/quickref/)
- [Google Dialogflow CX: Intents](https://docs.cloud.google.com/dialogflow/cx/docs/concept/intent)

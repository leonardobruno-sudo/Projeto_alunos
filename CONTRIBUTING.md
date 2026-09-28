# Contribuindo

## Fluxo Git

Este repositório usa um Gitflow enxuto. `main` representa a versão estável; `develop` integra mudanças para a próxima versão. Branches de trabalho devem ser curtas e partir de `develop`.

| Branch | Origem | Destino | Uso |
| --- | --- | --- | --- |
| `feature/<nome>` | `develop` | `develop` | Funcionalidade ou melhoria |
| `release/<versao>` | `develop` | `main` e `develop` | Estabilização de uma versão |
| `hotfix/<nome>` | `main` | `main` e `develop` | Correção urgente em produção |

Use nomes curtos, em minúsculas e separados por hífen, por exemplo `feature/relatorio-academico` ou `hotfix/login-sessao`.

## Divisão por área

Divida a responsabilidade pelo código, não por branches permanentes. Todas as áreas integram em `develop`; evite manter branches `frontend`, `api` ou `dados` vivas por semanas, pois elas acumulam divergência e conflitos.

| Área de trabalho | Pastas principais | Limite de integração |
| --- | --- | --- |
| API, autenticação e permissões | `apps/api/src/routes/`, `apps/api/src/modules/`, `apps/api/src/lib/` | Validar sessão, autorização e testes da rota no servidor |
| Interface | `apps/web/src/pages/`, `apps/web/src/components/` | Consumir os contratos publicados pela API; manter o acesso a dados no servidor |
| Dados acadêmicos | `apps/api/src/lib/database.js`, `apps/api/test/`, `apps/web/src/types.ts` | Coordenar mudanças de schema e DTO com API e interface na mesma entrega |
| Assistente e acessibilidade | `apps/api/src/modules/ai/`, `apps/web/src/features/chat/`, `ACCESSIBILITY.md` | Manter fontes e respostas revisadas; nunca ampliar o escopo de autorização do modelo |

Uma pessoa pode ser responsável principal por uma área e outra revisora. Mudanças em `database.js`, permissões, contratos entre API e web, sessões ou dependências são transversais: identifique as áreas afetadas no PR e combine a integração antes de alterar interfaces compartilhadas. Quando os usernames/equipes estiverem definidos, registre a revisão obrigatória por pasta em `.github/CODEOWNERS` e exija CODEOWNER approval nas regras do GitHub.

### Nova funcionalidade

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/area-descricao
```

Exemplos: `feature/api-importacao-csv`, `feature/web-estatisticas`, `feature/ai-ajuda-acessibilidade`. Trabalhe em uma entrega vertical pequena e abra um pull request de `feature/...` para `develop`. Descreva a área, o comportamento, os contratos alterados, riscos de dados e os testes; para mudanças visuais, inclua capturas de tela. O merge só ocorre após revisão e CI verde. Depois do merge, exclua a branch de feature.

Se duas pessoas precisarem atuar no mesmo recurso, alinhem primeiro o contrato API/DTO e dividam tarefas em branches curtas que partem do `develop` atualizado. Quando a alteração precisar de commits coordenados antes de estar pronta para `develop`, usem uma branch de integração temporária `feature/...`, façam PRs pequenos para ela e, por fim, um único PR dessa feature para `develop`.

### Preparar o ambiente

Use a versão indicada em `.nvmrc` e siga a seção de instalação e primeiro administrador no [README](README.md). Cada pessoa deve usar seu próprio banco local ou definir um `DATABASE_PATH` isolado; não compartilhem, enviem ou versionem o arquivo SQLite. Antes do PR, rode na raiz:

```bash
npm ci
npm ci --prefix apps/web
npm test
npm run lint
npm run build
```

O workflow `CI` repete testes, lint e build em pushes e pull requests. Se uma mudança alterar o setup, a lista de comandos ou as variáveis de ambiente, atualize o README no mesmo PR.

### Preparar uma versão

Crie `release/1.0.0` a partir de `develop` quando as funcionalidades planejadas estiverem prontas. Use essa branch apenas para correções e ajustes de lançamento. Após validar, integre-a em `main` e `develop`, marque `main` com `v1.0.0` e exclua a branch de release.

### Correção urgente

Crie `hotfix/nome-da-correcao` a partir de `main`. Depois de validar, integre a correção em `main` e `develop`, atualize a tag de versão e exclua a branch de hotfix.

## Verificações

Antes de abrir um pull request, execute na raiz do projeto:

```bash
npm test
npm run build
```

Descreva no pull request o problema, a solução e os testes executados. Não inclua chaves, senhas ou outros segredos nos commits.

Use mensagens de commit no formato `tipo: resumo`, por exemplo `feat: orientar uso por teclado` ou `fix: corrigir escopo da busca`. Para publicar versões, use tags SemVer como `v1.2.0`.

### Proteção no GitHub

Em **Settings > Rules > Rulesets**, crie regras para `main` e `develop`: exija pull request, exija a verificacao `verify` do workflow de CI e bloqueie force-push e exclusao da branch. Essa configuracao requer permissao de administracao no GitHub e nao pode ser aplicada apenas por arquivos locais.

## Quando simplificar

Gitflow é útil quando há versões planejadas ou manutenção de versões publicadas. Para deploy contínuo e frequente, branches `release` e `develop` podem adicionar trabalho desnecessário; nesse caso, considere GitHub Flow com `main` protegida e branches curtas de feature.

## Referências

- [Alura: Git Flow, o que é, quando utilizar e como funciona](https://www.alura.com.br/artigos/git-flow-o-que-e-como-quando-utilizar)
- [Atlassian: Gitflow Workflow](https://www.atlassian.com/br/git/tutorials/comparing-workflows/gitflow-workflow)
- [Vincent Driessen: A successful Git branching model](https://nvie.com/posts/a-successful-git-branching-model/)
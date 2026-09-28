# Contribuindo

## Fluxo Git

Este repositório usa um Gitflow enxuto. `main` representa a versão estável; `develop` integra mudanças para a próxima versão. Branches de trabalho devem ser curtas e partir de `develop`.

| Branch | Origem | Destino | Uso |
| --- | --- | --- | --- |
| `feature/<nome>` | `develop` | `develop` | Funcionalidade ou melhoria |
| `release/<versao>` | `develop` | `main` e `develop` | Estabilização de uma versão |
| `hotfix/<nome>` | `main` | `main` e `develop` | Correção urgente em produção |

Use nomes curtos, em minúsculas e separados por hífen, por exemplo `feature/relatorio-academico` ou `hotfix/login-sessao`.

### Nova funcionalidade

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/nome-da-funcionalidade
```

Ao concluir, abra um pull request de `feature/...` para `develop`. Depois do merge, exclua a branch de feature.

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
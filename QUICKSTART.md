# Início rápido

## Primeira instalação

Requer Node.js 20.19 LTS ou 22.12 ou superior.

```powershell
npm install
npm --prefix apps/web install
```

## Criar o banco local e o primeiro administrador

O clone não inclui dados acadêmicos, backups, sessões ou fotos. Na primeira execução, o SGAC cria `database/escola.db`, as tabelas e os índices automaticamente. Antes de abrir o sistema, defina as variáveis do primeiro administrador:

```powershell
$env:INITIAL_ADMIN_USERNAME = 'admin'
$env:INITIAL_ADMIN_PASSWORD = 'uma-senha-forte'
$env:INITIAL_ADMIN_NAME = 'Administrador'
npm run create:admin
```

Escolha uma senha real e não registre essas variáveis em arquivos versionados. Se precisar guardar o banco fora do projeto, defina `DATABASE_PATH` com o caminho absoluto desejado antes de executar o comando.

## Abrir o sistema automaticamente

```powershell
npm run quickstart
```

O comando compila o React, inicia o Express e abre a URL correta no navegador. Deixe o terminal aberto enquanto estiver usando o sistema. Para encerrar, pressione `Ctrl+C`.

Consulte o [README](README.md) para importação CSV, perfis de acesso, backup e execução em desenvolvimento.

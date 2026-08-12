# Início rápido

## Primeira instalação

Requer Node.js 20.17 ou superior.

```powershell
npm install
npm --prefix teste-react install
```

## Abrir o sistema automaticamente

```powershell
npm run quickstart
```

O comando compila o React, inicia o Express e abre a URL correta no navegador. Deixe o terminal aberto enquanto estiver usando o sistema. Para encerrar, pressione `Ctrl+C`.

Em um banco vazio, defina as variáveis do primeiro administrador antes de executar o comando:

```powershell
$env:INITIAL_ADMIN_USERNAME = 'admin'
$env:INITIAL_ADMIN_PASSWORD = 'uma-senha-forte'
$env:INITIAL_ADMIN_NAME = 'Administrador'
npm run create:admin
```

Consulte o [README](README.md) para importação CSV, perfis de acesso, backup e execução em desenvolvimento.

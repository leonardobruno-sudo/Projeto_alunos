/**
 * Builds the React client through the npm script and opens the URL emitted by
 * the Express server. It is the implementation behind `npm run quickstart`.
 */
const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..', '..');
const serverPath = path.join(__dirname, '..', 'server.js');
let browserOpened = false;

function openBrowser(url) {
  const commandByPlatform = {
    win32: ['cmd', ['/c', 'start', '', url]],
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]]
  };
  const command = commandByPlatform[process.platform];

  if (!command) {
    console.log(`Abra manualmente: ${url}`);
    return;
  }

  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
}

function forwardOutput(chunk, output) {
  const text = chunk.toString();
  output.write(text);

  const match = text.match(/Servidor rodando em (http:\/\/localhost:\d+)/);
  if (match && !browserOpened) {
    browserOpened = true;
    openBrowser(match[1]);
  }
}

const server = spawn(process.execPath, [serverPath], {
  cwd: projectRoot,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
  windowsHide: true
});

server.stdout.on('data', (chunk) => forwardOutput(chunk, process.stdout));
server.stderr.on('data', (chunk) => forwardOutput(chunk, process.stderr));
server.on('error', (error) => {
  console.error('Não foi possível iniciar o servidor:', error.message);
  process.exit(1);
});
server.on('exit', (code) => process.exit(code ?? 0));

process.env.DATABASE_PATH = process.env.DATABASE_PATH || '/tmp/escola.db';

const app = require('../apps/api/src/server');
const { getSql, runSql } = require('../apps/api/src/lib/database');
const { hashPassword } = require('../apps/api/src/lib/utils');

let initialization;

async function ensureInitialAdmin() {
  const username = String(process.env.INITIAL_ADMIN_USERNAME || '').trim().toLowerCase();
  const password = String(process.env.INITIAL_ADMIN_PASSWORD || '');
  if (!username && !password) return;
  if (!username || !password) {
    throw new Error('Defina INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD juntas.');
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,59}$/.test(username)) {
    throw new Error('INITIAL_ADMIN_USERNAME inválido.');
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('INITIAL_ADMIN_PASSWORD deve ter entre 8 e 72 bytes.');
  }

  const existingAdmin = await getSql('SELECT id FROM usuarios WHERE role = ? LIMIT 1', ['Admin']);
  if (existingAdmin) return;

  const name = String(process.env.INITIAL_ADMIN_NAME || 'Administrador').trim();
  await runSql(
    'INSERT INTO usuarios (username, password, role, nome) VALUES (?, ?, ?, ?)',
    [username, hashPassword(password), 'Admin', name || 'Administrador']
  );
  console.log(`Administrador inicial ${username} criado.`);
}

async function initialize() {
  if (!initialization) {
    initialization = app.initializeApp().then(() => ensureInitialAdmin());
  }
  await initialization;
  return app;
}

module.exports = async function vercelHandler(req, res) {
  const serverApp = await initialize();
  return serverApp(req, res);
};

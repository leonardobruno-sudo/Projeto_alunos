/**
 * One-time CLI utility that creates the first administrator in an empty
 * SQLite database using credentials supplied through environment variables.
 */
const { db, getSql, runSql, setupDatabase } = require('../lib/database');
const { hashPassword } = require('../lib/utils');

const username = String(process.env.INITIAL_ADMIN_USERNAME || '').trim().toLowerCase();
const password = String(process.env.INITIAL_ADMIN_PASSWORD || '');
const name = String(process.env.INITIAL_ADMIN_NAME || 'Administrador').trim();

async function closeDatabase(exitCode) {
  db.close(() => process.exit(exitCode));
}

async function createAdmin() {
  if (!username || !password) {
    console.error('Defina INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD antes de executar este comando.');
    return closeDatabase(1);
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,59}$/.test(username)) {
    console.error('INITIAL_ADMIN_USERNAME deve ter de 3 a 60 caracteres: letras, números, ponto, hífen ou sublinhado.');
    return closeDatabase(1);
  }
  if (password.length < 8) {
    console.error('INITIAL_ADMIN_PASSWORD deve ter pelo menos 8 caracteres.');
    return closeDatabase(1);
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    console.error('INITIAL_ADMIN_PASSWORD deve ter no máximo 72 bytes.');
    return closeDatabase(1);
  }

  try {
    await setupDatabase();
    const existingAdmin = await getSql('SELECT id FROM usuarios WHERE role = ? LIMIT 1', ['Admin']);
    if (existingAdmin) {
      console.error('Já existe um administrador. Crie as demais contas pela área de permissões.');
      return closeDatabase(1);
    }

    await runSql(
      'INSERT INTO usuarios (username, password, role, nome) VALUES (?, ?, ?, ?)',
      [username, hashPassword(password), 'Admin', name || 'Administrador']
    );
    console.log(`Administrador ${username} criado com sucesso.`);
    return closeDatabase(0);
  } catch (error) {
    console.error('Não foi possível criar o administrador:', error.message);
    return closeDatabase(1);
  }
}

void createAdmin();

/**
 * Application entry point: configures Express, session security, API routes
 * and delivery of the compiled React client.
 */
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { setupDatabase } = require('./lib/database');
const { SqliteSessionStore } = require('./lib/sessionStore');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'development-only-change-this-secret';
const sessionMaxAge = 1000 * 60 * 60;
const clientDistPath = path.join(__dirname, '..', 'teste-react', 'dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET é obrigatória em produção.');
}
if (!isProduction && !process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET não definida: usando uma chave apenas para desenvolvimento.');
}

if (isProduction) app.set('trust proxy', 1);

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));
app.use(session({
  name: 'gestao.sid',
  secret: sessionSecret,
  store: new SqliteSessionStore({ ttlMs: sessionMaxAge }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: sessionMaxAge
  }
}));

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next();

  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin === expectedOrigin) return next();

  return res.status(403).json({
    success: false,
    error: { code: 'invalid_origin', message: 'Origem da requisição não permitida.' }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'not_found', message: 'Recurso não encontrado.' }
  });
});

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}

app.get('*', (_req, res) => {
  if (fs.existsSync(clientIndexPath)) {
    return res.sendFile(clientIndexPath);
  }
  return res.status(503).send('Frontend React não compilado. Execute npm run build.');
});

app.use((error, req, res, _next) => {
  console.error('Erro interno:', error.stack || error.message || error);
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(500).json({
      success: false,
      error: { code: 'internal_error', message: 'Erro interno do servidor.' }
    });
  }
  return res.status(500).send('Erro interno do servidor.');
});

function listen(port) {
  const server = app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const fallbackPort = port + 1;
      console.warn(`Porta ${port} ocupada. Tentando ${fallbackPort}...`);
      listen(fallbackPort);
      return;
    }
    console.error('Erro ao iniciar servidor:', error.message);
    process.exit(1);
  });
}

async function startServer() {
  try {
    await setupDatabase();
    listen(PORT);
  } catch (error) {
    console.error('Erro ao preparar o banco de dados:', error.stack || error.message || error);
    process.exit(1);
  }
}

startServer();

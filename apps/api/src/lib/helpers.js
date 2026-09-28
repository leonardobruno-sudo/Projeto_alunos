/** Authentication middleware that validates the current database-backed session. */

const { getSql } = require('./database');

/**
 * src/lib/helpers.js
 *
 * Authentication middleware.
 *
 * Used by:
 *   - src/routes/api.js
 *   - src/routes/auth.js
 */
function sendUnauthenticated(req, res) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      error: { code: 'unauthorized', message: 'Sessão expirada ou inválida.' }
    });
  }

  return res.redirect('/login');
}

async function ensureAuth(req, res, next) {
  const userId = Number(req.session.user?.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return sendUnauthenticated(req, res);
  }

  try {
    const user = await getSql(
      'SELECT id, username, role, matricula, nome, curso, disciplina, turma, session_version FROM usuarios WHERE id = ?',
      [userId]
    );
    if (!user) {
      req.session.destroy(() => {});
      return sendUnauthenticated(req, res);
    }
    const sessionVersion = Number(req.session.user.sessionVersion ?? 0);
    const currentVersion = Number(user.session_version) || 0;
    if (!Number.isInteger(sessionVersion) || sessionVersion !== currentVersion) {
      req.session.destroy(() => {});
      return sendUnauthenticated(req, res);
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      matricula: user.matricula,
      nome: user.nome,
      curso: user.curso,
      disciplina: user.disciplina,
      turma: user.turma,
      sessionVersion: currentVersion
    };
    return next();
  } catch (error) {
    console.error('Erro ao validar sessão:', error.stack || error.message || error);
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(500).json({
        success: false,
        error: { code: 'internal_error', message: 'Não foi possível validar a sessão.' }
      });
    }
    return res.status(500).send('Erro interno do servidor.');
  }
}

module.exports = {
  ensureAuth
};

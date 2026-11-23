/**
 * Papel de `helpers`: oferece recursos compartilhados ao servidor, como sessão, permissões, respostas e acesso ao banco.
 * Este arquivo recebe ou produz dados para os módulos indicados pelos imports e exports abaixo.
 */
/** Middleware que confirma a sessão atual consultando o armazenamento do servidor. */

const { getSql } = require('./database');

/**
 * Arquivo: `src/lib/helpers.js`.
 *
 * Middleware de autenticação.
 *
 * Usado pelas rotas da API e de autenticação.
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

function canUseRouteBeforePasswordChange(req) {
  const pathname = new URL(req.originalUrl || '', 'http://sgac.local').pathname;
  return (req.method === 'GET' && pathname === '/api/auth/me') ||
    (req.method === 'POST' && pathname === '/api/auth/password') ||
    (req.method === 'POST' && pathname === '/api/auth/logout');
}

function sendPasswordChangeRequired(res) {
  return res.status(403).json({
    success: false,
    error: {
      code: 'password_change_required',
      message: 'Troque sua senha temporária antes de acessar o sistema.'
    }
  });
}

async function ensureAuth(req, res, next) {
  const userId = Number(req.session.user?.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return sendUnauthenticated(req, res);
  }

  try {
    const user = await getSql(
      `SELECT id, username, role, matricula, nome, curso, disciplina, turma,
              session_version, must_change_password, foto_perfil_versao,
              CASE WHEN foto_perfil IS NOT NULL AND length(foto_perfil) > 0 THEN 1 ELSE 0 END AS has_profile_photo
       FROM usuarios
       WHERE id = ?`,
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
      sessionVersion: currentVersion,
      mustChangePassword: Number(user.must_change_password) === 1,
      hasProfilePhoto: Number(user.has_profile_photo) === 1,
      profilePhotoVersion: Number(user.foto_perfil_versao) || 0
    };
    if (req.session.user.mustChangePassword && !canUseRouteBeforePasswordChange(req)) {
      return sendPasswordChangeRequired(res);
    }
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
  ensureAuth,
  canUseRouteBeforePasswordChange
};

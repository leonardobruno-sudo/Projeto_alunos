/**
 * JSON authentication endpoints for login, session lookup, logout and
 * password changes with rate limiting on invalid logins.
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  authenticateUser,
  changePassword,
  getProfilePhoto,
  updateProfilePhoto,
  removeProfilePhoto
} = require('../lib/auth');
const { ensureAuth } = require('../lib/helpers');
const { normalizeLookupValue } = require('../lib/utils');
const { MAX_PROFILE_PHOTO_SIZE, detectProfilePhotoMime } = require('../lib/profilePhoto');
const { apiSuccess, apiBadRequest, apiUnauthorized, apiServerError } = require('../lib/apiResponse');
const {
  canRegisterStudents,
  canDeleteStudents,
  canExportCsv,
  canEditOwnSubject
} = require('../lib/permissions');

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PROFILE_PHOTO_SIZE,
    files: 1,
    fields: 0
  }
});

function receiveProfilePhoto(req, res, next) {
  profilePhotoUpload.single('foto')(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return apiBadRequest(res, 'A foto de perfil pode ter no máximo 2 MB.');
      }
      return apiBadRequest(res, 'Envie somente uma foto no campo "foto".');
    }

    return apiBadRequest(res, 'Não foi possível receber a foto de perfil.');
  });
}

function getSessionData(user) {
  // Teachers follow their assigned subject through a dedicated scoped route;
  // they do not manage the full student enrollment.
  const canManageStudents = canRegisterStudents(user);
  const canManageUsers = user.role === 'Admin';
  return {
    user,
    capabilities: {
      canManageStudents,
      canRegisterStudents: canRegisterStudents(user),
      canDeleteStudents: canDeleteStudents(user),
      canExportCsv: canExportCsv(user),
      canEditOwnSubject: canEditOwnSubject(user),
      canBackup: canManageUsers,
      canManageUsers
    }
  };
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function getLoginAttempt(attemptKey) {
  const attempt = loginAttempts.get(attemptKey);
  if (!attempt || attempt.blockedUntil <= Date.now()) {
    loginAttempts.delete(attemptKey);
    return null;
  }
  return attempt;
}

// A shared school network must not let one person's typos block every other
// account. The rate limit remains tied to the originating IP and login value.
function getLoginAttemptKey(ip, username) {
  return JSON.stringify([String(ip || ''), normalizeLookupValue(username)]);
}

function registerFailedLogin(attemptKey) {
  const currentAttempt = getLoginAttempt(attemptKey) || { count: 0, blockedUntil: Date.now() + LOGIN_BLOCK_MS };
  const nextAttempt = {
    count: currentAttempt.count + 1,
    blockedUntil: Date.now() + LOGIN_BLOCK_MS
  };
  loginAttempts.set(attemptKey, nextAttempt);
}

router.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const loginAttemptKey = getLoginAttemptKey(req.ip, username);
  const loginAttempt = getLoginAttempt(loginAttemptKey);

  if (loginAttempt?.count >= MAX_LOGIN_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      error: { code: 'too_many_attempts', message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
    });
  }

  if (!username || !password) {
    return apiBadRequest(res, 'Informe usuário e senha.');
  }

  try {
    const user = await authenticateUser(username, password);
    await regenerateSession(req);
    req.session.user = user;
    await saveSession(req);
    loginAttempts.delete(loginAttemptKey);
    return apiSuccess(res, getSessionData(user), 'Login realizado com sucesso.');
  } catch (error) {
    if (error.code === 'invalid_credentials') {
      registerFailedLogin(loginAttemptKey);
      return apiUnauthorized(res, 'Usuário ou senha inválidos.', 'invalid_credentials');
    }
    console.error('Erro ao autenticar:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível concluir o login.');
  }
});

router.get('/me', ensureAuth, (req, res) => {
  return apiSuccess(res, getSessionData(req.session.user));
});

router.get('/profile/photo', ensureAuth, async (req, res) => {
  try {
    const photo = await getProfilePhoto(req.session.user.id);
    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!photo?.foto_perfil || !allowedMimeTypes.has(photo.foto_perfil_tipo)) {
      return res.status(404).json({
        success: false,
        error: { code: 'profile_photo_not_found', message: 'Nenhuma foto de perfil foi cadastrada.' }
      });
    }

    res.set({
      'Cache-Control': 'private, no-cache',
      'Content-Disposition': 'inline',
      'Content-Type': photo.foto_perfil_tipo,
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(photo.foto_perfil);
  } catch (error) {
    console.error('Erro ao buscar foto de perfil:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível carregar a foto de perfil.');
  }
});

router.put('/profile/photo', ensureAuth, receiveProfilePhoto, async (req, res) => {
  const photoMimeType = detectProfilePhotoMime(req.file?.buffer);
  if (!photoMimeType) {
    return apiBadRequest(res, 'Escolha uma imagem JPEG, PNG ou WebP válida.');
  }

  try {
    const updatedUser = await updateProfilePhoto(req.session.user.id, req.file.buffer, photoMimeType);
    if (!updatedUser) return apiUnauthorized(res, 'Sessão expirada ou inválida.');

    req.session.user = updatedUser;
    await saveSession(req);
    return apiSuccess(res, getSessionData(updatedUser), 'Foto de perfil atualizada com sucesso.');
  } catch (error) {
    console.error('Erro ao atualizar foto de perfil:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível atualizar a foto de perfil.');
  }
});

router.delete('/profile/photo', ensureAuth, async (req, res) => {
  try {
    const updatedUser = await removeProfilePhoto(req.session.user.id);
    if (!updatedUser) return apiUnauthorized(res, 'Sessão expirada ou inválida.');

    req.session.user = updatedUser;
    await saveSession(req);
    return apiSuccess(res, getSessionData(updatedUser), 'Foto de perfil removida com sucesso.');
  } catch (error) {
    console.error('Erro ao remover foto de perfil:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível remover a foto de perfil.');
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('Erro ao encerrar sessão:', error.message);
      return apiServerError(res, 'Não foi possível encerrar a sessão.');
    }
    res.clearCookie('gestao.sid');
    return apiSuccess(res, null, 'Sessão encerrada.');
  });
});

router.post('/password', ensureAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!currentPassword || !newPassword || !confirmPassword) {
    return apiBadRequest(res, 'Preencha todos os campos de senha.');
  }
  if (newPassword.length < 8) {
    return apiBadRequest(res, 'A nova senha deve ter ao menos 8 caracteres.');
  }
  if (Buffer.byteLength(newPassword, 'utf8') > 72) {
    return apiBadRequest(res, 'A nova senha deve ter no máximo 72 bytes.');
  }
  if (newPassword !== confirmPassword) {
    return apiBadRequest(res, 'A confirmação da nova senha não confere.');
  }

  try {
    const updatedUser = await changePassword(req.session.user.id, currentPassword, newPassword);
    req.session.user = updatedUser;
    await saveSession(req);
    return apiSuccess(res, null, 'Senha alterada com sucesso.');
  } catch (error) {
    if (error.code === 'invalid_current_password') {
      return apiBadRequest(res, 'Senha atual inválida.', 'invalid_current_password');
    }
    console.error('Erro ao alterar senha:', error.stack || error.message || error);
    return apiServerError(res, 'Não foi possível alterar a senha.');
  }
});

module.exports = router;

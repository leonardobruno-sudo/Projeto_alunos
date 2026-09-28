/**
 * Regression coverage for private profile-photo storage. The temporary
 * database keeps binary data out of the application's real school records.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sgac-profile-photo-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'escola.db');

const {
  db,
  getSql,
  setupDatabase,
  createStudentWithAccount,
  updateStudentFields,
  deleteStudentByMatricula
} = require('../src/lib/database');
const {
  getProfilePhoto,
  updateProfilePhoto,
  removeProfilePhoto,
  normalizeUser
} = require('../src/lib/auth');
const { MAX_PROFILE_PHOTO_SIZE, detectProfilePhotoMime } = require('../src/lib/profilePhoto');

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

test('foto de perfil é validada, fica privada no banco e sobrevive à edição de cadastro', async (t) => {
  t.after(async () => {
    await closeDatabase();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await setupDatabase();
  await createStudentWithAccount({
    matricula: 'FOTO-001',
    nome: 'Perfil Original',
    curso: 'Curso de teste',
    disciplina: 'Disciplina de teste',
    turma: 'Turma A'
  });

  const account = await getSql(
    "SELECT id, foto_perfil, foto_perfil_versao FROM usuarios WHERE role = 'Aluno' AND matricula = ?",
    ['FOTO-001']
  );
  assert.ok(account);
  assert.equal(account.foto_perfil, null);
  assert.equal(account.foto_perfil_versao, 0);

  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webpHeader = Buffer.from('RIFF0000WEBP', 'ascii');
  assert.equal(MAX_PROFILE_PHOTO_SIZE, 2 * 1024 * 1024);
  assert.equal(detectProfilePhotoMime(pngHeader), 'image/png');
  assert.equal(detectProfilePhotoMime(jpegHeader), 'image/jpeg');
  assert.equal(detectProfilePhotoMime(webpHeader), 'image/webp');
  assert.equal(detectProfilePhotoMime(Buffer.from('<svg></svg>')), null);

  const updatedUser = await updateProfilePhoto(account.id, pngHeader, 'image/png');
  assert.equal(updatedUser.hasProfilePhoto, true);
  assert.equal(updatedUser.profilePhotoVersion, 1);
  assert.equal('foto_perfil' in updatedUser, false);

  const storedPhoto = await getProfilePhoto(account.id);
  assert.equal(storedPhoto.foto_perfil_tipo, 'image/png');
  assert.deepEqual(storedPhoto.foto_perfil, pngHeader);

  // The enrollment is edited independently, but the account/profile photo
  // must remain intact while the database trigger synchronizes the name.
  await updateStudentFields('FOTO-001', { nome: 'Perfil Atualizado' });
  const synchronizedAccount = await getSql(
    'SELECT nome, foto_perfil, foto_perfil_versao FROM usuarios WHERE id = ?',
    [account.id]
  );
  assert.equal(synchronizedAccount.nome, 'Perfil Atualizado');
  assert.deepEqual(synchronizedAccount.foto_perfil, pngHeader);
  assert.equal(synchronizedAccount.foto_perfil_versao, 1);
  assert.equal(normalizeUser(synchronizedAccount).hasProfilePhoto, true);

  const withoutPhoto = await removeProfilePhoto(account.id);
  assert.equal(withoutPhoto.hasProfilePhoto, false);
  assert.equal(withoutPhoto.profilePhotoVersion, 2);
  assert.equal((await getProfilePhoto(account.id)).foto_perfil, null);

  await updateProfilePhoto(account.id, jpegHeader, 'image/jpeg');
  await deleteStudentByMatricula('FOTO-001');
  assert.equal(await getSql('SELECT id FROM usuarios WHERE id = ?', [account.id]), undefined);
});

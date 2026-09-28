/** Validation helpers for private profile-photo uploads. */

const MAX_PROFILE_PHOTO_SIZE = 2 * 1024 * 1024;

function detectProfilePhotoMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  if (isPng) return 'image/png';

  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  if (isJpeg) return 'image/jpeg';

  const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (isWebp) return 'image/webp';

  return null;
}

module.exports = {
  MAX_PROFILE_PHOTO_SIZE,
  detectProfilePhotoMime
};

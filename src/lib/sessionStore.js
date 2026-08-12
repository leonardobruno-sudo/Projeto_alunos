/**
 * Express session store backed by SQLite, including expiration handling and
 * cleanup of expired records.
 */
const session = require('express-session');
const { db } = require('./database');

const DEFAULT_TTL_MS = 60 * 60 * 1000;

function getExpiry(sessionData, fallbackTtlMs) {
  const expires = sessionData?.cookie?.expires ? new Date(sessionData.cookie.expires).getTime() : NaN;
  if (Number.isFinite(expires)) return expires;

  const maxAge = Number(sessionData?.cookie?.maxAge);
  if (Number.isFinite(maxAge) && maxAge > 0) return Date.now() + maxAge;

  return Date.now() + fallbackTtlMs;
}

class SqliteSessionStore extends session.Store {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    super();
    this.ttlMs = ttlMs;
  }

  get(sid, callback) {
    db.get(
      'SELECT sess FROM sessoes WHERE sid = ? AND expires > ?',
      [sid, Date.now()],
      (error, row) => {
        if (error) return callback(error);
        if (!row) return callback(null, null);

        try {
          return callback(null, JSON.parse(row.sess));
        } catch (_error) {
          db.run('DELETE FROM sessoes WHERE sid = ?', [sid], () => {});
          return callback(null, null);
        }
      }
    );
  }

  set(sid, sessionData, callback = () => {}) {
    const serializedSession = JSON.stringify(sessionData);
    const expires = getExpiry(sessionData, this.ttlMs);

    db.run(
      'INSERT INTO sessoes (sid, sess, expires) VALUES (?, ?, ?) ' +
      'ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires',
      [sid, serializedSession, expires],
      (error) => {
        if (error) return callback(error);
        db.run('DELETE FROM sessoes WHERE expires <= ?', [Date.now()], () => {});
        return callback(null);
      }
    );
  }

  destroy(sid, callback = () => {}) {
    db.run('DELETE FROM sessoes WHERE sid = ?', [sid], (error) => callback(error || null));
  }

  touch(sid, sessionData, callback = () => {}) {
    const serializedSession = JSON.stringify(sessionData);
    const expires = getExpiry(sessionData, this.ttlMs);
    db.run(
      'UPDATE sessoes SET sess = ?, expires = ? WHERE sid = ?',
      [serializedSession, expires, sid],
      (error) => callback(error || null)
    );
  }
}

module.exports = {
  SqliteSessionStore
};

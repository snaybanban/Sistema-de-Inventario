const crypto = require('crypto');

const PBKDF2_ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(
    String(password),
    String(salt),
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    DIGEST
  ).toString('hex');
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(String(expectedHash), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  makeSalt,
  hashPassword,
  verifyPassword,
  createSessionToken
};

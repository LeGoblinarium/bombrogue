const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;
const TOKEN_TTL = '30d';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.startsWith('changeme')) throw new Error('JWT_SECRET not configured');
  return s;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { hashPassword, checkPassword, signToken, verifyToken };

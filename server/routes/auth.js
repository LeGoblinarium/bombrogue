const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, checkPassword, signToken, verifyToken } = require('../auth');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Pseudo invalide (3–16 caractères, lettres/chiffres/_)' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 car. min.)' });

  try {
    const exists = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (exists.rows.length) return res.status(409).json({ error: 'Ce pseudo est déjà pris' });

    const hash = await hashPassword(password);
    const result = await db.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, rank, has_mordek',
      [username, hash]
    );
    const user = result.rows[0];
    const token = signToken({ userId: user.id, username: user.username, rank: user.rank, hasMordek: user.has_mordek });
    res.json({ token, user: { id: user.id, username: user.username, rank: user.rank, hasMordek: user.has_mordek } });
  } catch (err) {
    console.error('register error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });

  try {
    const result = await db.query(
      'SELECT id, username, password_hash, rank, has_mordek FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect' });

    const user = result.rows[0];
    const ok = await checkPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect' });

    const token = signToken({ userId: user.id, username: user.username, rank: user.rank, hasMordek: user.has_mordek });
    res.json({ token, user: { id: user.id, username: user.username, rank: user.rank, hasMordek: user.has_mordek } });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me — vérifie le token, renvoie les infos à jour + un token frais
router.get('/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = verifyToken(auth.slice(7));
    const result = await db.query(
      'SELECT id, username, rank, has_mordek FROM users WHERE id = $1',
      [payload.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const user = result.rows[0];
    // Issue a fresh token so the socket always gets the up-to-date rank
    const token = signToken({ userId: user.id, username: user.username, rank: user.rank, hasMordek: user.has_mordek });
    res.json({ token, id: user.id, username: user.username, rank: user.rank, hasMordek: user.has_mordek });
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
});

module.exports = router;

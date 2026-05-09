const express   = require('express');
const db        = require('../db');
const { verifyToken } = require('../auth');

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = verifyToken(auth.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}

/**
 * Factory — receives live Maps so routes always see current socket state.
 * @param {{ socketByUserId: Map, userStatus: Map, io: object }} ctx
 */
module.exports = function makeFriendsRouter({ socketByUserId, userStatus, io }) {
  const router = express.Router();
  router.use(requireAuth);

  // GET /api/friends — accepted friends with live online status
  router.get('/', async (req, res) => {
    try {
      const result = await db.query(
        `SELECT u.id, u.username, u.rank
         FROM friendships f
         JOIN users u ON u.id = CASE
           WHEN f.requester_id = $1 THEN f.addressee_id
           ELSE f.requester_id
         END
         WHERE (f.requester_id = $1 OR f.addressee_id = $1)
           AND f.status = 'accepted'
         ORDER BY u.username`,
        [req.user.userId]
      );
      res.json(result.rows.map(r => ({
        id:       r.id,
        username: r.username,
        rank:     r.rank,
        status:   userStatus.get(r.id) || 'offline',
      })));
    } catch (err) {
      console.error('get friends error:', err.message);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // GET /api/friends/requests — pending incoming requests
  router.get('/requests', async (req, res) => {
    try {
      const result = await db.query(
        `SELECT u.id, u.username, u.rank, f.created_at
         FROM friendships f
         JOIN users u ON u.id = f.requester_id
         WHERE f.addressee_id = $1 AND f.status = 'pending'
         ORDER BY f.created_at DESC`,
        [req.user.userId]
      );
      res.json(result.rows.map(r => ({
        id:          r.id,
        username:    r.username,
        rank:        r.rank,
        requestedAt: r.created_at,
      })));
    } catch (err) {
      console.error('get requests error:', err.message);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // POST /api/friends/request — send request { username }
  router.post('/request', async (req, res) => {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Pseudo manquant' });
    try {
      const targetRes = await db.query(
        'SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );
      if (!targetRes.rows.length)
        return res.status(404).json({ error: 'Joueur introuvable' });
      const target = targetRes.rows[0];

      if (target.id === req.user.userId)
        return res.status(400).json({ error: 'Impossible de s\'ajouter soi-même' });

      const existRes = await db.query(
        `SELECT status FROM friendships
         WHERE (requester_id = $1 AND addressee_id = $2)
            OR (requester_id = $2 AND addressee_id = $1)`,
        [req.user.userId, target.id]
      );
      if (existRes.rows.length) {
        return res.status(409).json({
          error: existRes.rows[0].status === 'accepted' ? 'Déjà amis' : 'Demande déjà en attente',
        });
      }

      await db.query(
        'INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)',
        [req.user.userId, target.id]
      );

      // Real-time notification to target if online
      const sid = socketByUserId.get(target.id);
      if (sid) {
        io.to(sid).emit('friend-request-received', {
          fromId:       req.user.userId,
          fromUsername: req.user.username,
        });
      }

      res.json({ ok: true, message: `Demande envoyée à ${target.username}` });
    } catch (err) {
      console.error('friend request error:', err.message);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // POST /api/friends/accept/:userId
  router.post('/accept/:userId', async (req, res) => {
    try {
      const result = await db.query(
        `UPDATE friendships SET status = 'accepted'
         WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
         RETURNING id`,
        [req.params.userId, req.user.userId]
      );
      if (!result.rows.length)
        return res.status(404).json({ error: 'Demande introuvable' });

      // Notify requester
      const sid = socketByUserId.get(req.params.userId);
      if (sid) {
        io.to(sid).emit('friend-request-accepted', {
          byId:       req.user.userId,
          byUsername: req.user.username,
        });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('accept friend error:', err.message);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // DELETE /api/friends/:userId — remove friend or decline request
  router.delete('/:userId', async (req, res) => {
    try {
      await db.query(
        `DELETE FROM friendships
         WHERE (requester_id = $1 AND addressee_id = $2)
            OR (requester_id = $2 AND addressee_id = $1)`,
        [req.user.userId, req.params.userId]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('remove friend error:', err.message);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
};

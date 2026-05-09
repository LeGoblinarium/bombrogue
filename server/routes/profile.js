const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/profile/:username — stats agrégées
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const userRes = await db.query(
      `SELECT u.id, u.username, u.rank, u.rank_points,
              COUNT(gp.id)::int                                         AS games_played,
              COUNT(CASE WHEN gp.finish_rank = 1 THEN 1 END)::int      AS wins,
              COALESCE(SUM(gp.damage_dealt),    0)::int                AS total_damage_dealt,
              COALESCE(SUM(gp.damage_received), 0)::int                AS total_damage_received,
              COALESCE(SUM(gp.bombs_placed),    0)::int                AS total_bombs_placed,
              COALESCE(SUM(gp.spells_used),     0)::int                AS total_spells_used
       FROM users u
       LEFT JOIN game_players gp ON gp.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)
       GROUP BY u.id`,
      [username]
    );

    if (!userRes.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const u = userRes.rows[0];

    const favRes = await db.query(
      `SELECT character, COUNT(*)::int AS cnt
       FROM game_players WHERE user_id = $1
       GROUP BY character ORDER BY cnt DESC LIMIT 1`,
      [u.id]
    );

    res.json({
      username:             u.username,
      rank:                 u.rank,
      rankPoints:           parseFloat(u.rank_points),
      gamesPlayed:          u.games_played,
      wins:                 u.wins,
      winRate:              u.games_played > 0 ? Math.round(u.wins / u.games_played * 100) : 0,
      totalDamageDealt:     u.total_damage_dealt,
      totalDamageReceived:  u.total_damage_received,
      totalBombsPlaced:     u.total_bombs_placed,
      totalSpellsUsed:      u.total_spells_used,
      favouriteCharacter:   favRes.rows[0]?.character || null,
    });
  } catch (err) {
    console.error('profile error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/profile/:username/games — historique des 50 dernières parties
router.get('/:username/games', async (req, res) => {
  try {
    const { username } = req.params;

    const userRes = await db.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    if (!userRes.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const userId = userRes.rows[0].id;

    const gamesRes = await db.query(
      `SELECT gp.finish_rank, gp.character,
              gp.damage_dealt, gp.damage_received, gp.bombs_placed, gp.spells_used,
              g.player_count, g.room_code, g.played_at
       FROM game_players gp
       JOIN games g ON g.id = gp.game_id
       WHERE gp.user_id = $1
       ORDER BY g.played_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json(gamesRes.rows.map(r => ({
      finishRank:      r.finish_rank,
      character:       r.character,
      damageDealt:     r.damage_dealt,
      damageReceived:  r.damage_received,
      bombsPlaced:     r.bombs_placed,
      spellsUsed:      r.spells_used,
      playerCount:     r.player_count,
      roomCode:        r.room_code,
      playedAt:        r.played_at,
    })));
  } catch (err) {
    console.error('games history error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

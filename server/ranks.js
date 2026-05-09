const db = require('./db');
const { signToken } = require('./auth');

const HISTORY_LIMIT = 50; // max game_players rows kept per user

// Points awarded per finish rank depending on total player count
const RANK_POINTS = {
  2: { 1: 1.0, 2: 0.5 },
  3: { 1: 1.0, 2: 0.5, 3: 0.2 },
  4: { 1: 1.0, 2: 0.4, 3: 0.2, 4: 0.1 },
};

/**
 * Save a completed game to the DB and update rank_points / rank for
 * every authenticated player.
 *
 * @param {object} room  - Room instance
 * @param {Array}  stats - array of { id, name, alive, stats: { damageDealt, damageReceived, bombsPlaced, spellsUsed } }
 * @param {string|null} winnerId - player id of the winner (null = draw / everyone dead)
 * @param {object} io    - Socket.io server (to emit rank-updated to connected sockets)
 * @param {Map}    socketByUserId - map userId → socketId for live notifications
 */
async function saveGame(room, stats, winnerId, io, socketByUserId) {
  try {
    const playerCount = stats.length;

    // Build finish ranking: winner = 1, then by hp descending, dead players last
    const ranked = [...stats].sort((a, b) => {
      if (a.id === winnerId) return -1;
      if (b.id === winnerId) return 1;
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.hp - a.hp;
    });

    // Insert game row
    const gameRes = await db.query(
      `INSERT INTO games (room_code, obstacle_count, turn_duration_ms, player_count)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [room.code, room.obstacleCount, room.turnDurationMs, playerCount]
    );
    const gameId = gameRes.rows[0].id;

    // For each player with an account, insert game_players + update rank
    for (let i = 0; i < ranked.length; i++) {
      const p = ranked[i];
      const finishRank = i + 1; // 1-based
      const roomPlayer = [...room.players.values(), ...room.disconnectedPlayers.values()]
        .find(rp => rp.id === p.id);
      const userId = roomPlayer ? roomPlayer.userId : null;
      if (!userId) continue; // guest — skip

      await db.query(
        `INSERT INTO game_players
           (game_id, user_id, character, finish_rank, damage_dealt, damage_received, bombs_placed, spells_used)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          gameId, userId,
          roomPlayer.character || 'player',
          finishRank,
          p.stats.damageDealt   || 0,
          p.stats.damageReceived || 0,
          p.stats.bombsPlaced   || 0,
          p.stats.spellsUsed    || 0,
        ]
      );

      // Trim history: keep only the HISTORY_LIMIT most recent entries for this user
      await db.query(
        `DELETE FROM game_players
         WHERE user_id = $1
           AND id NOT IN (
             SELECT id FROM game_players
             WHERE user_id = $1
             ORDER BY id DESC
             LIMIT $2
           )`,
        [userId, HISTORY_LIMIT]
      );

      // Update rank_points and rank.
      // Use a CTE to capture the old rank before the UPDATE so rank_delta is correct.
      const pts = (RANK_POINTS[playerCount] || {})[finishRank] || 0;
      if (pts > 0) {
        const updateRes = await db.query(
          `WITH prev AS (SELECT rank, has_mordek, username FROM users WHERE id = $2)
           UPDATE users
           SET rank_points = rank_points + $1,
               rank        = FLOOR(rank_points + $1)
           WHERE id = $2
           RETURNING rank,
                     rank - (SELECT rank FROM prev)       AS rank_delta,
                     (SELECT has_mordek FROM prev)        AS has_mordek,
                     (SELECT username   FROM prev)        AS username`,
          [pts, userId]
        );
        const row = updateRes.rows[0];
        if (row && row.rank_delta > 0) {
          // Issue a fresh JWT so the client's token reflects the new rank
          const newToken = signToken({
            userId,
            username:  row.username,
            rank:      row.rank,
            hasMordek: row.has_mordek,
          });

          const sid = socketByUserId.get(userId);
          if (sid) {
            // Update the live socket so the next room join uses the correct rank
            const liveSocket = io.sockets.sockets.get(sid);
            if (liveSocket) liveSocket.userRank = row.rank;

            io.to(sid).emit('rank-updated', { newRank: row.rank, token: newToken });
          }
        }
      }
    }

    // Clean up orphaned game rows (no authenticated players)
    await db.query(
      `DELETE FROM games WHERE id NOT IN (SELECT DISTINCT game_id FROM game_players)`
    );

  } catch (err) {
    console.error('saveGame error:', err.message);
  }
}

module.exports = { saveGame };

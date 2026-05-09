const express = require('express');
const Stripe  = require('stripe');
const db      = require('../db');
const { verifyToken, signToken } = require('../auth');

module.exports = function makePaymentsRouter({ io, socketByUserId }) {
  const router = express.Router();
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  // ── Auth middleware ────────────────────────────────────────────────────────
  function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Non authentifié' });
    try {
      req.user = verifyToken(token);
      next();
    } catch {
      res.status(401).json({ error: 'Token invalide ou expiré' });
    }
  }

  // ── POST /api/payments/mordek ──────────────────────────────────────────────
  // Creates a Stripe Checkout Session for purchasing Mordek (1.99 €)
  router.post('/mordek', requireAuth, async (req, res) => {
    const { userId, username } = req.user;

    // Idempotency: if already purchased, skip payment
    const check = await db.query('SELECT has_mordek FROM users WHERE id = $1', [userId]);
    if (check.rows[0]?.has_mordek) {
      return res.status(400).json({ error: 'Mordek déjà débloqué' });
    }

    const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Mordek — BombRogue',
              description: 'Débloque le personnage Mordek et supprime les publicités pour toute la room.',
              images: [`${BASE_URL}/images/mordek.png`],
            },
            unit_amount: 199, // 1.99 €
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${BASE_URL}/?payment=success`,
        cancel_url:  `${BASE_URL}/?payment=cancel`,
        metadata: { userId, username },
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error('Stripe session error:', err.message);
      res.status(500).json({ error: 'Erreur Stripe' });
    }
  });

  // ── POST /api/payments/webhook ─────────────────────────────────────────────
  // Called by Stripe on payment completion — raw body required for signature check
  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig    = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session  = event.data.object;
      const userId   = session.metadata?.userId;
      const username = session.metadata?.username;

      if (!userId) {
        console.error('Webhook: missing userId in metadata');
        return res.json({ received: true });
      }

      try {
        // Mark Mordek as purchased + fetch current rank for token
        const result = await db.query(
          `UPDATE users SET has_mordek = TRUE WHERE id = $1
           RETURNING rank, username`,
          [userId]
        );
        const row = result.rows[0];
        if (!row) {
          console.error('Webhook: user not found', userId);
          return res.json({ received: true });
        }

        // Issue fresh JWT with hasMordek = true
        const newToken = signToken({
          userId,
          username: row.username,
          rank: row.rank,
          hasMordek: true,
        });

        // Notify connected socket
        const sid = socketByUserId.get(userId);
        if (sid) {
          const liveSocket = io.sockets.sockets.get(sid);
          if (liveSocket) liveSocket.hasMordek = true;
          io.to(sid).emit('mordek-unlocked', { token: newToken });
        }

        console.log(`Mordek unlocked for ${row.username} (${userId})`);
      } catch (err) {
        console.error('Webhook DB error:', err.message);
      }
    }

    res.json({ received: true });
  });

  return router;
};

const express = require('express');
const { validateInitData } = require('../telegramAuth');
const {
  getGiveaway,
  countParticipants,
  hasParticipant,
  addParticipant,
  getWinner,
} = require('../db');

const router = express.Router();

function extractInitData(req) {
  return (
    req.get('x-telegram-init-data') ||
    req.body?.initData ||
    req.query?.initData ||
    ''
  );
}

function authMiddleware(req, res, next) {
  try {
    const initData = extractInitData(req);
    const result = validateInitData(initData);
    if (!result) {
      return res.status(401).json({ error: 'invalid_init_data', message: 'Не вдалося перевірити дані Telegram. Відкрийте Mini App через кнопку в боті.' });
    }
    req.tgUser = result.user;
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'auth_error', message: err.message });
  }
}

function serializeGiveaway(g, userId) {
  const winner = g.status === 'finished' ? getWinner(g.id) : null;
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    mediaUrl: g.media_path ? `/media/${require('path').basename(g.media_path)}` : null,
    mediaType: g.media_type,
    buttonText: g.button_text,
    startAt: g.start_at,
    endAt: g.end_at,
    status: g.status, // scheduled | active | finished
    participantsCount: countParticipants(g.id),
    hasJoined: hasParticipant(g.id, userId),
    isWinner: !!(winner && String(winner.user_id) === String(userId)),
    winnerAnnounced: !!winner,
  };
}

// GET /api/giveaway/:id
router.get('/:id', authMiddleware, (req, res) => {
  const giveawayId = Number(req.params.id);
  if (!Number.isInteger(giveawayId)) {
    return res.status(400).json({ error: 'bad_request', message: 'Некоректний ID розіграшу' });
  }
  const g = getGiveaway(giveawayId);
  if (!g) {
    return res.status(404).json({ error: 'not_found', message: 'Розіграш не знайдено' });
  }
  return res.json(serializeGiveaway(g, req.tgUser.id));
});

// POST /api/giveaway/:id/participate
router.post('/:id/participate', authMiddleware, (req, res) => {
  const giveawayId = Number(req.params.id);
  if (!Number.isInteger(giveawayId)) {
    return res.status(400).json({ error: 'bad_request', message: 'Некоректний ID розіграшу' });
  }

  const g = getGiveaway(giveawayId);
  if (!g) {
    return res.status(404).json({ error: 'not_found', message: 'Розіграш не знайдено' });
  }

  const user = req.tgUser;

  if (hasParticipant(giveawayId, user.id)) {
    return res.json({
      joined: true,
      alreadyJoined: true,
      message: 'Ви вже берете участь у цьому розіграші.',
      giveaway: serializeGiveaway(g, user.id),
    });
  }

  if (g.status !== 'active') {
    const msg =
      g.status === 'scheduled'
        ? 'Розіграш ще не розпочався.'
        : 'Розіграш уже завершився, участь більше неможлива.';
    return res.status(409).json({ error: 'giveaway_not_active', message: msg, giveaway: serializeGiveaway(g, user.id) });
  }

  const added = addParticipant(giveawayId, user.id, user.username, user.first_name);

  if (!added) {
    // Дубль (гонка запитів) - все одно не помилка для користувача
    return res.json({
      joined: true,
      alreadyJoined: true,
      message: 'Ви вже берете участь у цьому розіграші.',
      giveaway: serializeGiveaway(g, user.id),
    });
  }

  return res.json({
    joined: true,
    alreadyJoined: false,
    message: 'Вітаю вас додано до розіграша',
    giveaway: serializeGiveaway(g, user.id),
  });
});

module.exports = router;

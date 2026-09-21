require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const giveawayRoutes = require('./src/routes/giveaway');

const app = express();
const PORT = process.env.PORT || 3000;

const MEDIA_DIR = path.resolve(
  __dirname,
  process.env.GIVEAWAY_MEDIA_DIR || '../bot_prk/giveaway_media'
);

app.use(cors());
app.use(express.json());

// Статика самого Mini App (index.html, styles.css, app.js)
app.use(express.static(path.join(__dirname, 'public')));

// Фото/відео розіграшів, які завантажив адмін через бота
app.use('/media', express.static(MEDIA_DIR));

app.use('/api/giveaway', giveawayRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

// Будь-який інший шлях (наприклад /?giveaway_id=5) повертає SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PokerPRK Giveaway Mini App running on http://localhost:${PORT}`);
  console.log(`DB path resolved to: ${require('./src/db').db.name}`);
});

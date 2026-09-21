const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.resolve(__dirname, '..', process.env.DB_PATH || '../bot_prk/my_library.db');

const db = new Database(DB_PATH);
// WAL узгоджує паралельний доступ з Python-ботом (sqlite3) до того самого файлу.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Схема ІДЕНТИЧНА до giveaways/db.py на Python-стороні. CREATE TABLE IF NOT EXISTS
// робить це безпечним незалежно від того, який процес запуститься першим.
db.exec(`
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    media_path TEXT,
    media_type TEXT,
    button_text TEXT NOT NULL DEFAULT '🎁 Участвовать',
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    published INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS giveaway_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT,
    first_name TEXT,
    joined_at INTEGER NOT NULL,
    UNIQUE(giveaway_id, user_id),
    FOREIGN KEY(giveaway_id) REFERENCES giveaways(id)
  );

  CREATE TABLE IF NOT EXISTS giveaway_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id INTEGER NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    username TEXT,
    first_name TEXT,
    picked_at INTEGER NOT NULL,
    FOREIGN KEY(giveaway_id) REFERENCES giveaways(id)
  );

  CREATE INDEX IF NOT EXISTS idx_participants_giveaway ON giveaway_participants(giveaway_id);
`);

function computeStatus(startAt, endAt, now = Math.floor(Date.now() / 1000)) {
  if (now < startAt) return 'scheduled';
  if (now <= endAt) return 'active';
  return 'finished';
}

function getGiveaway(id) {
  const row = db
    .prepare('SELECT * FROM giveaways WHERE id = ? AND is_deleted = 0')
    .get(id);
  if (!row) return null;
  row.status = computeStatus(row.start_at, row.end_at);
  return row;
}

function countParticipants(giveawayId) {
  const row = db
    .prepare('SELECT COUNT(*) as c FROM giveaway_participants WHERE giveaway_id = ?')
    .get(giveawayId);
  return row.c;
}

function hasParticipant(giveawayId, userId) {
  const row = db
    .prepare('SELECT 1 FROM giveaway_participants WHERE giveaway_id = ? AND user_id = ?')
    .get(giveawayId, userId);
  return !!row;
}

function addParticipant(giveawayId, userId, username, firstName) {
  const now = Math.floor(Date.now() / 1000);
  try {
    db.prepare(
      `INSERT INTO giveaway_participants (giveaway_id, user_id, username, first_name, joined_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(giveawayId, userId, username || null, firstName || null, now);
    return true;
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || String(err.message).includes('UNIQUE')) {
      return false; // вже брав участь - дубль не створюємо
    }
    throw err;
  }
}

function getWinner(giveawayId) {
  return db.prepare('SELECT * FROM giveaway_winners WHERE giveaway_id = ?').get(giveawayId) || null;
}

module.exports = {
  db,
  computeStatus,
  getGiveaway,
  countParticipants,
  hasParticipant,
  addParticipant,
  getWinner,
};

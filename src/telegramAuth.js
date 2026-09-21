const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SKIP_VALIDATION = String(process.env.SKIP_INITDATA_VALIDATION).toLowerCase() === 'true';

// Скільки секунд вважаємо initData "свіжим" (захист від replay-атак старим initData).
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Перевіряє Telegram.WebApp.initData за офіційним алгоритмом Telegram:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Повертає { user, authDate } якщо підпис валідний, інакше null.
 */
function validateInitData(initData) {
  if (!initData || typeof initData !== 'string') return null;

  if (SKIP_VALIDATION) {
    // Тільки для локальної розробки поза Telegram!
    try {
      const params = new URLSearchParams(initData);
      const user = JSON.parse(params.get('user') || 'null');
      return { user, authDate: Number(params.get('auth_date') || 0) };
    } catch {
      return null;
    }
  }

  if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN не задано в .env - неможливо перевірити initData');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);
  if (authDate && now - authDate > MAX_AUTH_AGE_SECONDS) {
    return null; // застарілий initData
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    user = null;
  }
  if (!user || !user.id) return null;

  return { user, authDate };
}

module.exports = { validateInitData };

const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { categories } = require('../utils/notificationPreferenceSchema');

async function values(userId) {
  const result = await pool.query('SELECT category, enabled FROM notification_preferences WHERE user_id=$1', [userId]);
  const saved = new Map(result.rows.map((row) => [row.category, Boolean(row.enabled)]));
  return Object.fromEntries(categories.map((category) => [category, saved.get(category) ?? true]));
}

async function list(req, res) {
  res.json({ success: true, data: await values(req.user.id) });
}

async function update(req, res) {
  const body = req.body || {};
  const keys = Object.keys(body);
  const invalid = keys.find((key) => !categories.includes(key));
  if (invalid) throw new AppError(`Unknown notification preference: ${invalid}.`, 400);
  const invalidValue = keys.find((key) => typeof body[key] !== 'boolean');
  if (invalidValue) throw new AppError(`Notification preference ${invalidValue} must be boolean.`, 400);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const category of keys) {
      await client.query(
        `INSERT INTO notification_preferences(user_id,category,enabled,updated_at)
         VALUES($1,$2,$3,CURRENT_TIMESTAMP)
         ON CONFLICT(user_id,category) DO UPDATE SET enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP`,
        [req.user.id, category, body[category] ? 1 : 0]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  res.json({ success: true, data: await values(req.user.id) });
}

async function reset(req, res) {
  await pool.query('DELETE FROM notification_preferences WHERE user_id=$1', [req.user.id]);
  res.json({ success: true, data: await values(req.user.id) });
}

module.exports = { list, update, reset };
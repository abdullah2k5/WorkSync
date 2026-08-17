const db = require('../config/database');
const AppError = require('../utils/AppError');
const { categories } = require('../utils/notificationPreferenceSchema');

function values(userId) {
  const rows = db.prepare('SELECT category, enabled FROM notification_preferences WHERE user_id=?').all(userId);
  const saved = new Map(rows.map((row) => [row.category, Boolean(row.enabled)]));
  return Object.fromEntries(categories.map((category) => [category, saved.get(category) ?? true]));
}

function list(req, res) {
  res.json({ success: true, data: values(req.user.id) });
}

function update(req, res) {
  const body = req.body || {};
  const keys = Object.keys(body);
  const invalid = keys.find((key) => !categories.includes(key));
  if (invalid) throw new AppError(`Unknown notification preference: ${invalid}.`, 400);
  const invalidValue = keys.find((key) => typeof body[key] !== 'boolean');
  if (invalidValue) throw new AppError(`Notification preference ${invalidValue} must be boolean.`, 400);
  const statement = db.prepare(`INSERT INTO notification_preferences(user_id,category,enabled,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,category) DO UPDATE SET enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP`);
  db.exec('BEGIN');
  try {
    for (const category of keys) statement.run(req.user.id, category, body[category] ? 1 : 0);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  res.json({ success: true, data: values(req.user.id) });
}

function reset(req, res) {
  db.prepare('DELETE FROM notification_preferences WHERE user_id=?').run(req.user.id);
  res.json({ success: true, data: values(req.user.id) });
}

module.exports = { list, update, reset };

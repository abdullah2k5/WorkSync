const db = require('../config/database');

const userStreams = new Map();

function getUnreadCount(userId) {
  const row = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId);
  return Number(row?.count || 0);
}

function emitUnreadCount(userId) {
  const streamSet = userStreams.get(userId);
  if (!streamSet || !streamSet.size) return;

  const payload = JSON.stringify({ type: 'unread_count', count: getUnreadCount(userId) });
  for (const { res } of streamSet) {
    res.write(`event: unread_count\ndata: ${payload}\n\n`);
  }
}

function emitNotification(userId, notification) {
  const streamSet = userStreams.get(userId);
  if (!streamSet || !streamSet.size || !notification) return;

  const payload = JSON.stringify({ type: 'notification', notification });
  for (const { res } of streamSet) {
    res.write(`event: notification\ndata: ${payload}\n\n`);
  }

  emitUnreadCount(userId);
}

function addUserStream(userId, res) {
  if (!userId || !res) return;

  if (!userStreams.has(userId)) userStreams.set(userId, new Set());
  const connection = { id: `${Date.now()}-${Math.random()}`, res };
  userStreams.get(userId).add(connection);

  res.write(`event: connected\ndata: ${JSON.stringify({ connected: true, userId })}\n\n`);
  emitUnreadCount(userId);

  res.on('close', () => {
    const streamSet = userStreams.get(userId);
    if (!streamSet) return;
    streamSet.delete(connection);
    if (!streamSet.size) userStreams.delete(userId);
  });
}

module.exports = { addUserStream, emitNotification, emitUnreadCount, getUnreadCount };


const pool = require('../config/database');

const userStreams = new Map();

async function getUnreadCount(userId) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::integer AS count
      FROM notifications
      WHERE user_id = $1
        AND is_read = 0
    `,
    [userId]
  );

  return Number(result.rows[0]?.count || 0);
}

async function emitUnreadCount(userId) {
  const streamSet = userStreams.get(userId);

  if (!streamSet || !streamSet.size) return;

  try {
    const count = await getUnreadCount(userId);
    const payload = JSON.stringify({
      type: 'unread_count',
      count
    });

    for (const { res } of streamSet) {
      res.write(`event: unread_count\ndata: ${payload}\n\n`);
    }
  } catch (error) {
    console.error('[NOTIFICATION STREAM] Failed to emit unread count:', error);
  }
}

async function emitNotification(userId, notification) {
  const streamSet = userStreams.get(userId);

  if (!streamSet || !streamSet.size || !notification) return;

  const payload = JSON.stringify({
    type: 'notification',
    notification
  });

  for (const { res } of streamSet) {
    res.write(`event: notification\ndata: ${payload}\n\n`);
  }

  await emitUnreadCount(userId);
}

function addUserStream(userId, res) {
  if (!userId || !res) return;

  if (!userStreams.has(userId)) {
    userStreams.set(userId, new Set());
  }

  const connection = {
    id: `${Date.now()}-${Math.random()}`,
    res
  };

  userStreams.get(userId).add(connection);

  res.write(
    `event: connected\ndata: ${JSON.stringify({
      connected: true,
      userId
    })}\n\n`
  );

  void emitUnreadCount(userId);

  res.on('close', () => {
    const streamSet = userStreams.get(userId);

    if (!streamSet) return;

    streamSet.delete(connection);

    if (!streamSet.size) {
      userStreams.delete(userId);
    }
  });
}

module.exports = {
  addUserStream,
  emitNotification,
  emitUnreadCount,
  getUnreadCount
};

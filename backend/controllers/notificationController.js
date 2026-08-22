
const pool = require('../config/postgres');
const AppError = require('../utils/AppError');
const { emitUnreadCount } = require('../utils/notificationStream');

async function list(req, res) {
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const result = await pool.query(
    `
      SELECT *
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [req.user.id, limit]
  );

  res.json({
    success: true,
    data: result.rows
  });
}

async function unreadCount(req, res) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::integer AS count
      FROM notifications
      WHERE user_id = $1
        AND is_read = 0
    `,
    [req.user.id]
  );

  res.json({
    success: true,
    data: {
      count: result.rows[0].count
    }
  });
}

async function readOne(req, res) {
  const result = await pool.query(
    `
      SELECT id, user_id
      FROM notifications
      WHERE id = $1
    `,
    [req.params.id]
  );

  const notification = result.rows[0];

  if (!notification) {
    throw new AppError('Notification not found.', 404);
  }

  if (notification.user_id !== req.user.id) {
    throw new AppError(
      'You are not authorized to access this notification.',
      403
    );
  }

  await pool.query(
    `
      UPDATE notifications
      SET is_read = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
    [notification.id]
  );

  await emitUnreadCount(req.user.id);

  const updated = await pool.query(
    `
      SELECT *
      FROM notifications
      WHERE id = $1
    `,
    [notification.id]
  );

  res.json({
    success: true,
    data: updated.rows[0]
  });
}

async function readAll(req, res) {
  await pool.query(
    `
      UPDATE notifications
      SET is_read = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
        AND is_read = 0
    `,
    [req.user.id]
  );

  await emitUnreadCount(req.user.id);

  res.json({
    success: true,
    message: 'All notifications marked as read.'
  });
}

async function remove(req, res) {
  const result = await pool.query(
    `
      SELECT id, user_id
      FROM notifications
      WHERE id = $1
    `,
    [req.params.id]
  );

  const notification = result.rows[0];

  if (!notification) {
    throw new AppError('Notification not found.', 404);
  }

  if (notification.user_id !== req.user.id) {
    throw new AppError(
      'You are not authorized to delete this notification.',
      403
    );
  }

  await pool.query(
    `
      DELETE FROM notifications
      WHERE id = $1
    `,
    [notification.id]
  );

  await emitUnreadCount(req.user.id);

  res.json({
    success: true,
    message: 'Notification deleted.'
  });
}

async function clearAll(req, res) {
  const countResult = await pool.query(
    `
      SELECT COUNT(*)::integer AS count
      FROM notifications
      WHERE user_id = $1
    `,
    [req.user.id]
  );

  if (!Number(countResult.rows[0].count)) {
    throw new AppError('No notifications to clear.', 400);
  }

  await pool.query(
    `
      DELETE FROM notifications
      WHERE user_id = $1
    `,
    [req.user.id]
  );

  await emitUnreadCount(req.user.id);

  res.json({
    success: true,
    message: 'All notifications cleared.'
  });
}

module.exports = {
  list,
  unreadCount,
  readOne,
  readAll,
  remove,
  clearAll
};

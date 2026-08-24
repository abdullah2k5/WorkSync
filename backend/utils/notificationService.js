
const pool = require('../config/database');
const { emitNotification } = require('./notificationStream');

const categoryFor = (type, title) => {
  if (type === 'leave') return 'leave_update';
  if (type === 'announcement') return 'announcement';
  if (
    title.startsWith('Task assigned by ') ||
    title === 'Task assigned to you' ||
    title === 'Task assignment changed'
  ) {
    return 'task_assignment';
  }
  if (title === 'New task comment') return 'task_comment';
  if (title === 'Blocker reported') return 'blocker_created';
  if (title === 'Blocker resolved') return 'blocker_resolved';
  if (title === 'Task attachment uploaded') return 'attachment';
  if (title === 'Upcoming task deadline' || title === 'Task due today') {
    return 'due_date_reminder';
  }
  if (title === 'Task overdue') return 'overdue_task';

  return null;
};

async function notifyUser(
  userId,
  type,
  title,
  message,
  entityType,
  entityId,
  allowDuplicateEvents = false
) {
  if (!userId) return;

  const category = categoryFor(type, title);

  if (category) {
    const preference = await pool.query(
      `
        SELECT enabled
        FROM notification_preferences
        WHERE user_id = $1
          AND category = $2
      `,
      [userId, category]
    );

    if (preference.rows[0] && !preference.rows[0].enabled) {
      return;
    }
  }

  if (!allowDuplicateEvents) {
    const exists = await pool.query(
      `
        SELECT id
        FROM notifications
        WHERE user_id = $1
          AND type = $2
          AND related_entity_type = $3
          AND related_entity_id = $4
          AND title = $5
          AND message = $6
        LIMIT 1
      `,
      [userId, type, entityType, entityId, title, message]
    );

    if (exists.rows.length) return;
  }

  const result = await pool.query(
    `
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        related_entity_type,
        related_entity_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [userId, type, title, message, entityType, entityId]
  );

  emitNotification(userId, result.rows[0]);
}

async function notifyEmployee(
  employeeId,
  type,
  title,
  message,
  entityType,
  entityId
) {
  const result = await pool.query(
    `
      SELECT user_id
      FROM employees
      WHERE id = $1
    `,
    [employeeId]
  );

  const row = result.rows[0];

  if (row) {
    await notifyUser(
      row.user_id,
      type,
      title,
      message,
      entityType,
      entityId
    );
  }
}

async function notifyRole(
  role,
  type,
  title,
  message,
  entityType,
  entityId
) {
  const result = await pool.query(
    `
      SELECT id
      FROM users
      WHERE role = $1
        AND is_active = 1
    `,
    [role]
  );

  for (const user of result.rows) {
    await notifyUser(
      user.id,
      type,
      title,
      message,
      entityType,
      entityId
    );
  }
}

async function notifyManagerOf(
  employeeId,
  type,
  title,
  message,
  entityType,
  entityId
) {
  const result = await pool.query(
    `
      SELECT manager_id
      FROM employees
      WHERE id = $1
    `,
    [employeeId]
  );

  const employee = result.rows[0];

  if (employee && employee.manager_id) {
    await notifyEmployee(
      employee.manager_id,
      type,
      title,
      message,
      entityType,
      entityId
    );
  }
}

module.exports = {
  notifyUser,
  notifyEmployee,
  notifyRole,
  notifyManagerOf
}; 
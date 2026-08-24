const pool = require('../config/database');

async function createTaskActivity({
  taskId,
  actorUserId,
  activityType,
  oldValue = null,
  newValue = null,
  metadata = null
}) {
  const result = await pool.query(
    `
      INSERT INTO task_activity (
        task_id,
        actor_user_id,
        activity_type,
        old_value,
        new_value,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      taskId,
      actorUserId,
      activityType,
      oldValue,
      newValue,
      metadata ? JSON.stringify(metadata) : null
    ]
  );

  return result.rows[0];
}

module.exports = {
  createTaskActivity
};
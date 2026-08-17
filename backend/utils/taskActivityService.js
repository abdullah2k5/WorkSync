const db = require('../config/database');

function createTaskActivity({ taskId, actorUserId, activityType, oldValue = null, newValue = null, metadata = null }) {
  return db.prepare(`
    INSERT INTO task_activity (task_id, actor_user_id, activity_type, old_value, new_value, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(taskId, actorUserId, activityType, oldValue, newValue, metadata ? JSON.stringify(metadata) : null);
}

module.exports = { createTaskActivity };

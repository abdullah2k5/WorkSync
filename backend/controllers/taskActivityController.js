const db = require('../config/database');
const AppError = require('../utils/AppError');
const { canView, getTask, getProfile } = require('./taskController');

function list(req, res) {
  const task = getTask(req.params.taskId);
  if (!task) throw new AppError('Task not found.', 404);
  if (!canView(task, getProfile(req.user.id))) throw new AppError('You are not authorized to access this task.', 403);

  const rows = db.prepare(`
    SELECT a.id, a.task_id, a.activity_type, a.old_value, a.new_value, a.metadata, a.created_at,
      a.actor_user_id, u.role AS actor_role,
      e.first_name || ' ' || e.last_name AS actor_name,
      e.profile_picture AS actor_avatar
    FROM task_activity a
    JOIN users u ON u.id = a.actor_user_id
    LEFT JOIN employees e ON e.user_id = a.actor_user_id
    WHERE a.task_id = ?
    ORDER BY a.created_at ASC, a.id ASC
  `).all(req.params.taskId);

  res.json({ success: true, data: rows });
}

module.exports = { list };

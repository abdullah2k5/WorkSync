const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { canView, getTask, getProfile } = require('./taskController');
const { createTaskActivity } = require('../utils/taskActivityService');

async function access(req, taskId) {
  const task = await getTask(taskId);
  if (!task) throw new AppError('Task not found.', 404);
  const p = await getProfile(req.user.id);
  if (!(await canView(task, p))) throw new AppError('You are not authorized to access this task.', 403);
  return task;
}

async function canManage(req, task) {
  const profile = await getProfile(req.user.id);
  return profile.role === 'admin' || (profile.role === 'manager' && task.created_by === profile.id);
}

async function labels(req, res) {
  await access(req, req.params.taskId);
  const result = await pool.query(
    'SELECT l.id,l.name,l.color FROM labels l JOIN task_labels tl ON tl.label_id=l.id WHERE tl.task_id=$1 ORDER BY l.name',
    [req.params.taskId]
  );
  res.json({ success: true, data: result.rows });
}

async function allLabels(req, res) {
  const result = await pool.query('SELECT id,name,color FROM labels ORDER BY name');
  res.json({ success: true, data: result.rows });
}

async function createLabel(req, res) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 50) throw new AppError('Label name must be between 1 and 50 characters.', 400);
  try {
    const inserted = await pool.query(
      'INSERT INTO labels(name,color) VALUES($1,$2) RETURNING id,name,color',
      [name, typeof req.body.color === 'string' ? req.body.color : 'indigo']
    );
    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    if (error.code === '23505') throw new AppError('A label with that name already exists.', 409);
    throw error;
  }
}

async function assignLabel(req, res) {
  const task = await access(req, req.params.taskId);
  if (!(await canManage(req, task))) throw new AppError('Only the task manager can change labels.', 403);
  const found = await pool.query('SELECT id FROM labels WHERE id=$1', [req.params.labelId]);
  const label = found.rows[0];
  if (!label) throw new AppError('Label not found.', 404);
  const exists = await pool.query('SELECT 1 FROM task_labels WHERE task_id=$1 AND label_id=$2', [task.id, label.id]);
  if (!exists.rows.length) {
    await pool.query('INSERT INTO task_labels(task_id,label_id) VALUES($1,$2)', [task.id, label.id]);
    await createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: 'LABEL_ADDED', metadata: { labelId: label.id } });
  }
  const result = await pool.query(
    'SELECT l.id,l.name,l.color FROM labels l JOIN task_labels tl ON tl.label_id=l.id WHERE tl.task_id=$1 ORDER BY l.name',
    [task.id]
  );
  res.json({ success: true, data: result.rows });
}

async function removeLabel(req, res) {
  const task = await access(req, req.params.taskId);
  if (!(await canManage(req, task))) throw new AppError('Only the task manager can change labels.', 403);
  const removed = await pool.query('DELETE FROM task_labels WHERE task_id=$1 AND label_id=$2', [task.id, req.params.labelId]);
  if (removed.rowCount) {
    await createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: 'LABEL_REMOVED', metadata: { labelId: Number(req.params.labelId) } });
  }
  const result = await pool.query(
    'SELECT l.id,l.name,l.color FROM labels l JOIN task_labels tl ON tl.label_id=l.id WHERE tl.task_id=$1 ORDER BY l.name',
    [task.id]
  );
  res.json({ success: true, data: result.rows });
}

async function subtasks(req, res) {
  await access(req, req.params.taskId);
  const result = await pool.query(
    'SELECT id,task_id,title,is_completed,position,created_by,created_at,updated_at,completed_at FROM task_subtasks WHERE task_id=$1 ORDER BY position,id',
    [req.params.taskId]
  );
  res.json({ success: true, data: result.rows });
}

async function addSubtask(req, res) {
  const task = await access(req, req.params.taskId);
  const profile = await getProfile(req.user.id);
  if (!(await canManage(req, task)) && task.assigned_to !== profile.id) throw new AppError('You are not authorized to manage subtasks.', 403);
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title || title.length > 200) throw new AppError('Subtask title must be between 1 and 200 characters.', 400);
  const positionResult = await pool.query('SELECT COALESCE(MAX(position),-1)+1 AS position FROM task_subtasks WHERE task_id=$1', [task.id]);
  const position = positionResult.rows[0].position;
  const inserted = await pool.query(
    'INSERT INTO task_subtasks(task_id,title,position,created_by) VALUES($1,$2,$3,$4) RETURNING *',
    [task.id, title, position, req.user.id]
  );
  await createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: 'SUBTASK_CREATED', newValue: title });
  res.status(201).json({ success: true, data: inserted.rows[0] });
}

async function updateSubtask(req, res) {
  const task = await access(req, req.params.taskId);
  const profile = await getProfile(req.user.id);
  if (!(await canManage(req, task)) && task.assigned_to !== profile.id) throw new AppError('You are not authorized to manage subtasks.', 403);
  const found = await pool.query('SELECT * FROM task_subtasks WHERE id=$1 AND task_id=$2', [req.params.subtaskId, task.id]);
  const subtask = found.rows[0];
  if (!subtask) throw new AppError('Subtask not found.', 404);
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : subtask.title;
  const completed = typeof req.body?.is_completed === 'boolean' ? (req.body.is_completed ? 1 : 0) : subtask.is_completed;
  if (!title || title.length > 200) throw new AppError('Subtask title must be between 1 and 200 characters.', 400);
  const completedAt = completed && !subtask.is_completed ? new Date() : completed ? subtask.completed_at : null;
  const updated = await pool.query(
    'UPDATE task_subtasks SET title=$1,is_completed=$2,completed_at=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *',
    [title, completed, completedAt, subtask.id]
  );
  if (completed !== subtask.is_completed) {
    await createTaskActivity({
      taskId: task.id,
      actorUserId: req.user.id,
      activityType: completed ? 'SUBTASK_COMPLETED' : 'SUBTASK_REOPENED',
      oldValue: String(subtask.is_completed),
      newValue: String(completed),
      metadata: { subtaskId: subtask.id }
    });
  }
  res.json({ success: true, data: updated.rows[0] });
}

async function deleteSubtask(req, res) {
  const task = await access(req, req.params.taskId);
  if (!(await canManage(req, task))) throw new AppError('Only the task manager can delete subtasks.', 403);
  const found = await pool.query('SELECT * FROM task_subtasks WHERE id=$1 AND task_id=$2', [req.params.subtaskId, task.id]);
  const subtask = found.rows[0];
  if (!subtask) throw new AppError('Subtask not found.', 404);
  await pool.query('DELETE FROM task_subtasks WHERE id=$1', [subtask.id]);
  await createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: 'SUBTASK_DELETED', oldValue: subtask.title });
  res.json({ success: true, message: 'Subtask deleted.' });
}

module.exports = { labels, allLabels, createLabel, assignLabel, removeLabel, subtasks, addSubtask, updateSubtask, deleteSubtask };
const db = require('../config/database');
const AppError = require('../utils/AppError');
const { canView, getTask, getProfile } = require('./taskController');
const { createTaskActivity } = require('../utils/taskActivityService');

function access(req, taskId) {
  const task = getTask(taskId);
  if (!task) throw new AppError('Task not found.', 404);
  if (!canView(task, getProfile(req.user.id))) throw new AppError('You are not authorized to access this task.', 403);
  return task;
}
function canManage(req, task) {
  const profile = getProfile(req.user.id);
  return profile.role === 'admin' || (profile.role === 'manager' && task.created_by === profile.id);
}
function labels(req, res) {
  access(req, req.params.taskId);
  res.json({ success: true, data: db.prepare('SELECT l.id,l.name,l.color FROM labels l JOIN task_labels tl ON tl.label_id=l.id WHERE tl.task_id=? ORDER BY l.name').all(req.params.taskId) });
}
function allLabels(req, res) { res.json({ success: true, data: db.prepare('SELECT id,name,color FROM labels ORDER BY name').all() }); }
function createLabel(req, res) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 50) throw new AppError('Label name must be between 1 and 50 characters.', 400);
  try { const result = db.prepare('INSERT INTO labels(name,color) VALUES(?,?)').run(name, typeof req.body.color === 'string' ? req.body.color : 'indigo'); res.status(201).json({ success: true, data: db.prepare('SELECT id,name,color FROM labels WHERE id=?').get(result.lastInsertRowid) }); } catch (error) { if (error.code?.includes('CONSTRAINT')) throw new AppError('A label with that name already exists.', 409); throw error; }
}
function assignLabel(req, res) {
  const task = access(req, req.params.taskId);
  if (!canManage(req, task)) throw new AppError('Only the task manager can change labels.', 403);
  const label = db.prepare('SELECT id FROM labels WHERE id=?').get(req.params.labelId);
  if (!label) throw new AppError('Label not found.', 404);
  const exists = db.prepare('SELECT 1 FROM task_labels WHERE task_id=? AND label_id=?').get(task.id, label.id);
  if (!exists) { db.prepare('INSERT INTO task_labels(task_id,label_id) VALUES(?,?)').run(task.id, label.id); createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: 'LABEL_ADDED', metadata: { labelId: label.id } }); }
  res.json({ success: true, data: db.prepare('SELECT l.id,l.name,l.color FROM labels l JOIN task_labels tl ON tl.label_id=l.id WHERE tl.task_id=? ORDER BY l.name').all(task.id) });
}
function removeLabel(req, res) {
  const task = access(req, req.params.taskId);
  if (!canManage(req, task)) throw new AppError('Only the task manager can change labels.', 403);
  const removed = db.prepare('DELETE FROM task_labels WHERE task_id=? AND label_id=?').run(task.id, req.params.labelId);
  if (removed.changes) createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: 'LABEL_REMOVED', metadata: { labelId: Number(req.params.labelId) } });
  res.json({ success: true, data: db.prepare('SELECT l.id,l.name,l.color FROM labels l JOIN task_labels tl ON tl.label_id=l.id WHERE tl.task_id=? ORDER BY l.name').all(task.id) });
}
function subtasks(req, res) { access(req, req.params.taskId); res.json({ success: true, data: db.prepare('SELECT id,task_id,title,is_completed,position,created_by,created_at,updated_at,completed_at FROM task_subtasks WHERE task_id=? ORDER BY position,id').all(req.params.taskId) }); }
function addSubtask(req, res) {
  const task = access(req, req.params.taskId);
  if (!canManage(req, task) && task.assigned_to !== getProfile(req.user.id).id) throw new AppError('You are not authorized to manage subtasks.', 403);
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title || title.length > 200) throw new AppError('Subtask title must be between 1 and 200 characters.', 400);
  const position = db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS position FROM task_subtasks WHERE task_id=?').get(task.id).position;
  const result = db.prepare('INSERT INTO task_subtasks(task_id,title,position,created_by) VALUES(?,?,?,?)').run(task.id,title,position,req.user.id);
  createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: 'SUBTASK_CREATED', newValue: title });
  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM task_subtasks WHERE id=?').get(result.lastInsertRowid) });
}
function updateSubtask(req, res) {
  const task = access(req, req.params.taskId); const profile = getProfile(req.user.id);
  if (!canManage(req, task) && task.assigned_to !== profile.id) throw new AppError('You are not authorized to manage subtasks.', 403);
  const subtask = db.prepare('SELECT * FROM task_subtasks WHERE id=? AND task_id=?').get(req.params.subtaskId, task.id);
  if (!subtask) throw new AppError('Subtask not found.', 404);
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : subtask.title;
  const completed = typeof req.body?.is_completed === 'boolean' ? (req.body.is_completed ? 1 : 0) : subtask.is_completed;
  if (!title || title.length > 200) throw new AppError('Subtask title must be between 1 and 200 characters.', 400);
  db.prepare('UPDATE task_subtasks SET title=?,is_completed=?,completed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(title,completed,completed && !subtask.is_completed ? new Date().toISOString() : completed ? subtask.completed_at : null,subtask.id);
  if (completed !== subtask.is_completed) createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: completed ? 'SUBTASK_COMPLETED' : 'SUBTASK_REOPENED', oldValue: String(subtask.is_completed), newValue: String(completed), metadata: { subtaskId: subtask.id } });
  res.json({ success: true, data: db.prepare('SELECT * FROM task_subtasks WHERE id=?').get(subtask.id) });
}
function deleteSubtask(req, res) {
  const task = access(req, req.params.taskId); if (!canManage(req, task)) throw new AppError('Only the task manager can delete subtasks.', 403);
  const subtask = db.prepare('SELECT * FROM task_subtasks WHERE id=? AND task_id=?').get(req.params.subtaskId, task.id); if (!subtask) throw new AppError('Subtask not found.', 404);
  db.prepare('DELETE FROM task_subtasks WHERE id=?').run(subtask.id); createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: 'SUBTASK_DELETED', oldValue: subtask.title }); res.json({ success: true, message: 'Subtask deleted.' });
}
module.exports = { labels, allLabels, createLabel, assignLabel, removeLabel, subtasks, addSubtask, updateSubtask, deleteSubtask };

const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const AppError = require('../utils/AppError');
const { canView, getTask, getProfile } = require('./taskController');
const { createTaskActivity } = require('../utils/taskActivityService');
const { notifyUser } = require('../utils/notificationService');

function taskParticipants(task, actorUserId, extraUserIds = []) {
  const employeeIds = [task.created_by, task.assigned_to].filter(Boolean);
  const userIds = employeeIds.length ? db.prepare(`SELECT user_id FROM employees WHERE id IN (${employeeIds.map(() => '?').join(',')})`).all(...employeeIds).map((row) => row.user_id) : [];
  return [...new Set([...userIds, ...extraUserIds].filter((userId) => userId && Number(userId) !== Number(actorUserId)))];
}

function actorName(userId) {
  const row = db.prepare("SELECT first_name || ' ' || last_name AS name FROM employees WHERE user_id=?").get(userId);
  return row?.name || 'A team member';
}

function notifyTaskParticipants(task, actorUserId, title, message, extraUserIds = []) {
  const recipients = taskParticipants(task, actorUserId, extraUserIds);
  for (const userId of recipients) {
    try { notifyUser(userId, 'task', title, message, 'task', task.id, true); } catch (error) { console.error('Task collaboration notification failed', error); }
  }
}

function taskAccess(req, taskId) {
  const task = getTask(taskId);
  if (!task) throw new AppError('Task not found.', 404);
  if (!canView(task, getProfile(req.user.id))) throw new AppError('You are not authorized to access this task.', 403);
  return task;
}

function comments(req, res) {
  taskAccess(req, req.params.taskId);
  const rows = db.prepare(`
    SELECT c.id, c.task_id, c.body, c.created_at, c.updated_at,
      c.author_user_id, u.role AS author_role,
      e.first_name || ' ' || e.last_name AS author_name, e.profile_picture AS author_avatar
    FROM task_comments c
    JOIN users u ON u.id = c.author_user_id
    LEFT JOIN employees e ON e.user_id = c.author_user_id
    WHERE c.task_id=? ORDER BY c.created_at ASC, c.id ASC
  `).all(req.params.taskId);
  res.json({ success: true, data: rows });
}

function addComment(req, res) {
  taskAccess(req, req.params.taskId);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body) throw new AppError('Comment text is required.', 400);
  if (body.length > 2000) throw new AppError('Comments must be 2000 characters or less.', 400);
  const result = db.prepare('INSERT INTO task_comments(task_id,author_user_id,body) VALUES(?,?,?)').run(req.params.taskId, req.user.id, body);
  createTaskActivity({ taskId: req.params.taskId, actorUserId: req.user.id, activityType: 'COMMENT_ADDED', metadata: { commentId: result.lastInsertRowid } });
  const task = getTask(req.params.taskId);
  notifyTaskParticipants(task, req.user.id, 'New task comment', `${actorName(req.user.id)} commented on task "${task.title}".`);
  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM task_comments WHERE id=?').get(result.lastInsertRowid) });
}

function blockers(req, res) {
  taskAccess(req, req.params.taskId);
  const rows = db.prepare(`
    SELECT b.id, b.task_id, b.description, b.status, b.resolved_at, b.created_at, b.updated_at,
      b.reported_by_user_id, b.resolved_by_user_id,
      e.first_name || ' ' || e.last_name AS reporter_name,
      r.first_name || ' ' || r.last_name AS resolver_name
    FROM task_blockers b
    JOIN users u ON u.id=b.reported_by_user_id
    LEFT JOIN employees e ON e.user_id=b.reported_by_user_id
    LEFT JOIN employees r ON r.user_id=b.resolved_by_user_id
    WHERE b.task_id=? ORDER BY b.created_at ASC, b.id ASC
  `).all(req.params.taskId);
  res.json({ success: true, data: rows });
}

function addBlocker(req, res) {
  taskAccess(req, req.params.taskId);
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!description) throw new AppError('Blocker description is required.', 400);
  if (description.length > 2000) throw new AppError('Blockers must be 2000 characters or less.', 400);
  const result = db.prepare('INSERT INTO task_blockers(task_id,reported_by_user_id,description) VALUES(?,?,?)').run(req.params.taskId, req.user.id, description);
  createTaskActivity({ taskId: req.params.taskId, actorUserId: req.user.id, activityType: 'BLOCKER_REPORTED', metadata: { blockerId: result.lastInsertRowid } });
  const task = getTask(req.params.taskId);
  notifyTaskParticipants(task, req.user.id, 'Blocker reported', `${actorName(req.user.id)} reported a blocker on task "${task.title}".`);
  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM task_blockers WHERE id=?').get(result.lastInsertRowid) });
}

function updateBlocker(req, res) {
  const task = taskAccess(req, req.params.taskId);
  const blocker = db.prepare('SELECT * FROM task_blockers WHERE id=? AND task_id=?').get(req.params.blockerId, req.params.taskId);
  if (!blocker) throw new AppError('Blocker not found.', 404);
  const profile = getProfile(req.user.id);
  const isManager = profile.role === 'admin' || profile.role === 'manager';
  if (!isManager && blocker.reported_by_user_id !== req.user.id) throw new AppError('You can only resolve blockers you reported.', 403);
  const status = req.body?.status;
  if (!['OPEN', 'RESOLVED'].includes(status)) throw new AppError('Blocker status must be OPEN or RESOLVED.', 400);
  if (status === blocker.status) return res.json({ success: true, data: blocker });
  db.prepare(`UPDATE task_blockers SET status=?,resolved_by_user_id=?,resolved_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, status === 'RESOLVED' ? req.user.id : null, status === 'RESOLVED' ? new Date().toISOString() : null, blocker.id);
  createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: status === 'RESOLVED' ? 'BLOCKER_RESOLVED' : 'BLOCKER_REOPENED', oldValue: blocker.status, newValue: status, metadata: { blockerId: blocker.id } });
  if (status === 'RESOLVED') notifyTaskParticipants(task, req.user.id, 'Blocker resolved', `The blocker on task "${task.title}" was resolved by ${actorName(req.user.id)}.`, [blocker.reported_by_user_id]);
  res.json({ success: true, data: db.prepare('SELECT * FROM task_blockers WHERE id=?').get(blocker.id) });
}

function attachments(req, res) {
  taskAccess(req, req.params.taskId);
  const rows = db.prepare(`
    SELECT a.id, a.task_id, a.original_name, a.mime_type, a.size_bytes, a.created_at,
      a.uploaded_by_user_id, e.first_name || ' ' || e.last_name AS uploader_name
    FROM task_attachments a
    LEFT JOIN employees e ON e.user_id=a.uploaded_by_user_id
    WHERE a.task_id=? ORDER BY a.created_at ASC, a.id ASC
  `).all(req.params.taskId);
  res.json({ success: true, data: rows });
}

function addAttachment(req, res) {
  taskAccess(req, req.params.taskId);
  if (!req.file) throw new AppError('A file is required.', 400);
  const result = db.prepare(`INSERT INTO task_attachments
    (task_id,uploaded_by_user_id,original_name,stored_name,storage_path,mime_type,size_bytes)
    VALUES(?,?,?,?,?,?,?)`).run(req.params.taskId, req.user.id, req.file.originalname, req.file.filename, req.file.path, req.file.mimetype, req.file.size);
  createTaskActivity({ taskId: req.params.taskId, actorUserId: req.user.id, activityType: 'ATTACHMENT_ADDED', metadata: { attachmentId: result.lastInsertRowid, originalName: req.file.originalname } });
  const task = getTask(req.params.taskId);
  notifyTaskParticipants(task, req.user.id, 'Task attachment uploaded', `${actorName(req.user.id)} uploaded an attachment to task "${task.title}".`);
  res.status(201).json({ success: true, data: db.prepare('SELECT id,task_id,original_name,mime_type,size_bytes,created_at FROM task_attachments WHERE id=?').get(result.lastInsertRowid) });
}

function downloadAttachment(req, res) {
  taskAccess(req, req.params.taskId);
  const attachment = db.prepare('SELECT * FROM task_attachments WHERE id=? AND task_id=?').get(req.params.attachmentId, req.params.taskId);
  if (!attachment || !fs.existsSync(attachment.storage_path)) throw new AppError('Attachment not found.', 404);
  res.download(path.resolve(attachment.storage_path), attachment.original_name);
}

function removeAttachment(req, res) {
  const task = taskAccess(req, req.params.taskId);
  const attachment = db.prepare('SELECT * FROM task_attachments WHERE id=? AND task_id=?').get(req.params.attachmentId, req.params.taskId);
  if (!attachment) throw new AppError('Attachment not found.', 404);
  const profile = getProfile(req.user.id);
  if (req.user.id !== attachment.uploaded_by_user_id && !['admin', 'manager'].includes(profile.role)) throw new AppError('You are not authorized to remove this attachment.', 403);
  db.prepare('DELETE FROM task_attachments WHERE id=?').run(attachment.id);
  if (fs.existsSync(attachment.storage_path)) fs.unlinkSync(attachment.storage_path);
  createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: 'ATTACHMENT_REMOVED', metadata: { attachmentId: attachment.id, originalName: attachment.original_name } });
  res.json({ success: true, message: 'Attachment removed.' });
}

module.exports = { comments, addComment, blockers, addBlocker, updateBlocker, attachments, addAttachment, downloadAttachment, removeAttachment };

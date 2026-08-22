const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { canView, getTask, getProfile } = require('./taskController');
const { createTaskActivity } = require('../utils/taskActivityService');
const { notifyUser } = require('../utils/notificationService');

async function taskParticipants(task, actorUserId, extraUserIds = []) {
  const employeeIds = [task.created_by, task.assigned_to].filter(Boolean);
  let userIds = [];
  if (employeeIds.length) {
    const placeholders = employeeIds.map((_, index) => `$${index + 1}`).join(',');
    const result = await pool.query(`SELECT user_id FROM employees WHERE id IN (${placeholders})`, employeeIds);
    userIds = result.rows.map((row) => row.user_id);
  }
  return [...new Set([...userIds, ...extraUserIds].filter((userId) => userId && Number(userId) !== Number(actorUserId)))];
}

async function actorName(userId) {
  const result = await pool.query("SELECT first_name || ' ' || last_name AS name FROM employees WHERE user_id = $1", [userId]);
  return result.rows[0]?.name || 'A team member';
}

async function notifyTaskParticipants(task, actorUserId, title, message, extraUserIds = []) {
  const recipients = await taskParticipants(task, actorUserId, extraUserIds);
  for (const userId of recipients) {
    try {
      await notifyUser(userId, 'task', title, message, 'task', task.id, true);
    } catch (error) {
      console.error('Task collaboration notification failed', error);
    }
  }
}

async function taskAccess(req, taskId) {
  const task = await getTask(taskId);
  if (!task) throw new AppError('Task not found.', 404);
  const p = await getProfile(req.user.id);
  if (!(await canView(task, p))) throw new AppError('You are not authorized to access this task.', 403);
  return task;
}

async function comments(req, res) {
  await taskAccess(req, req.params.taskId);
  const result = await pool.query(
    `
    SELECT c.id, c.task_id, c.body, c.created_at, c.updated_at,
      c.author_user_id, u.role AS author_role,
      e.first_name || ' ' || e.last_name AS author_name, e.profile_picture AS author_avatar
    FROM task_comments c
    JOIN users u ON u.id = c.author_user_id
    LEFT JOIN employees e ON e.user_id = c.author_user_id
    WHERE c.task_id = $1 ORDER BY c.created_at ASC, c.id ASC
  `,
    [req.params.taskId]
  );
  res.json({ success: true, data: result.rows });
}

async function addComment(req, res) {
  await taskAccess(req, req.params.taskId);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body) throw new AppError('Comment text is required.', 400);
  if (body.length > 2000) throw new AppError('Comments must be 2000 characters or less.', 400);
  const inserted = await pool.query(
    'INSERT INTO task_comments(task_id,author_user_id,body) VALUES($1,$2,$3) RETURNING *',
    [req.params.taskId, req.user.id, body]
  );
  const comment = inserted.rows[0];
  await createTaskActivity({ taskId: req.params.taskId, actorUserId: req.user.id, activityType: 'COMMENT_ADDED', metadata: { commentId: comment.id } });
  const task = await getTask(req.params.taskId);
  await notifyTaskParticipants(task, req.user.id, 'New task comment', `${await actorName(req.user.id)} commented on task "${task.title}".`);
  res.status(201).json({ success: true, data: comment });
}

async function blockers(req, res) {
  await taskAccess(req, req.params.taskId);
  const result = await pool.query(
    `
    SELECT b.id, b.task_id, b.description, b.status, b.resolved_at, b.created_at, b.updated_at,
      b.reported_by_user_id, b.resolved_by_user_id,
      e.first_name || ' ' || e.last_name AS reporter_name,
      r.first_name || ' ' || r.last_name AS resolver_name
    FROM task_blockers b
    JOIN users u ON u.id = b.reported_by_user_id
    LEFT JOIN employees e ON e.user_id = b.reported_by_user_id
    LEFT JOIN employees r ON r.user_id = b.resolved_by_user_id
    WHERE b.task_id = $1 ORDER BY b.created_at ASC, b.id ASC
  `,
    [req.params.taskId]
  );
  res.json({ success: true, data: result.rows });
}

async function addBlocker(req, res) {
  await taskAccess(req, req.params.taskId);
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!description) throw new AppError('Blocker description is required.', 400);
  if (description.length > 2000) throw new AppError('Blockers must be 2000 characters or less.', 400);
  const inserted = await pool.query(
    'INSERT INTO task_blockers(task_id,reported_by_user_id,description) VALUES($1,$2,$3) RETURNING *',
    [req.params.taskId, req.user.id, description]
  );
  const blocker = inserted.rows[0];
  await createTaskActivity({ taskId: req.params.taskId, actorUserId: req.user.id, activityType: 'BLOCKER_REPORTED', metadata: { blockerId: blocker.id } });
  const task = await getTask(req.params.taskId);
  await notifyTaskParticipants(task, req.user.id, 'Blocker reported', `${await actorName(req.user.id)} reported a blocker on task "${task.title}".`);
  res.status(201).json({ success: true, data: blocker });
}

async function updateBlocker(req, res) {
  const task = await taskAccess(req, req.params.taskId);
  const found = await pool.query('SELECT * FROM task_blockers WHERE id=$1 AND task_id=$2', [req.params.blockerId, req.params.taskId]);
  const blocker = found.rows[0];
  if (!blocker) throw new AppError('Blocker not found.', 404);
  const profile = await getProfile(req.user.id);
  const isManager = profile.role === 'admin' || profile.role === 'manager';
  if (!isManager && blocker.reported_by_user_id !== req.user.id) throw new AppError('You can only resolve blockers you reported.', 403);
  const status = req.body?.status;
  if (!['OPEN', 'RESOLVED'].includes(status)) throw new AppError('Blocker status must be OPEN or RESOLVED.', 400);
  if (status === blocker.status) return res.json({ success: true, data: blocker });
  const updated = await pool.query(
    `UPDATE task_blockers SET status=$1,resolved_by_user_id=$2,resolved_at=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,
    [status, status === 'RESOLVED' ? req.user.id : null, status === 'RESOLVED' ? new Date() : null, blocker.id]
  );
  await createTaskActivity({
    taskId: task.id,
    actorUserId: req.user.id,
    activityType: status === 'RESOLVED' ? 'BLOCKER_RESOLVED' : 'BLOCKER_REOPENED',
    oldValue: blocker.status,
    newValue: status,
    metadata: { blockerId: blocker.id }
  });
  if (status === 'RESOLVED') {
    await notifyTaskParticipants(task, req.user.id, 'Blocker resolved', `The blocker on task "${task.title}" was resolved by ${await actorName(req.user.id)}.`, [blocker.reported_by_user_id]);
  }
  res.json({ success: true, data: updated.rows[0] });
}

async function attachments(req, res) {
  await taskAccess(req, req.params.taskId);
  const result = await pool.query(
    `
    SELECT a.id, a.task_id, a.original_name, a.mime_type, a.size_bytes, a.created_at,
      a.uploaded_by_user_id, e.first_name || ' ' || e.last_name AS uploader_name
    FROM task_attachments a
    LEFT JOIN employees e ON e.user_id = a.uploaded_by_user_id
    WHERE a.task_id = $1 ORDER BY a.created_at ASC, a.id ASC
  `,
    [req.params.taskId]
  );
  res.json({ success: true, data: result.rows });
}

async function addAttachment(req, res) {
  await taskAccess(req, req.params.taskId);
  if (!req.file) throw new AppError('A file is required.', 400);
  const inserted = await pool.query(
    `INSERT INTO task_attachments
      (task_id,uploaded_by_user_id,original_name,stored_name,storage_path,mime_type,size_bytes)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING id,task_id,original_name,mime_type,size_bytes,created_at`,
    [req.params.taskId, req.user.id, req.file.originalname, req.file.filename, req.file.path, req.file.mimetype, req.file.size]
  );
  const attachment = inserted.rows[0];
  await createTaskActivity({ taskId: req.params.taskId, actorUserId: req.user.id, activityType: 'ATTACHMENT_ADDED', metadata: { attachmentId: attachment.id, originalName: req.file.originalname } });
  const task = await getTask(req.params.taskId);
  await notifyTaskParticipants(task, req.user.id, 'Task attachment uploaded', `${await actorName(req.user.id)} uploaded an attachment to task "${task.title}".`);
  res.status(201).json({ success: true, data: attachment });
}

async function downloadAttachment(req, res) {
  await taskAccess(req, req.params.taskId);
  const found = await pool.query('SELECT * FROM task_attachments WHERE id=$1 AND task_id=$2', [req.params.attachmentId, req.params.taskId]);
  const attachment = found.rows[0];
  if (!attachment || !fs.existsSync(attachment.storage_path)) throw new AppError('Attachment not found.', 404);
  res.download(path.resolve(attachment.storage_path), attachment.original_name);
}

async function removeAttachment(req, res) {
  const task = await taskAccess(req, req.params.taskId);
  const found = await pool.query('SELECT * FROM task_attachments WHERE id=$1 AND task_id=$2', [req.params.attachmentId, req.params.taskId]);
  const attachment = found.rows[0];
  if (!attachment) throw new AppError('Attachment not found.', 404);
  const profile = await getProfile(req.user.id);
  if (req.user.id !== attachment.uploaded_by_user_id && !['admin', 'manager'].includes(profile.role)) {
    throw new AppError('You are not authorized to remove this attachment.', 403);
  }
  await pool.query('DELETE FROM task_attachments WHERE id=$1', [attachment.id]);
  if (fs.existsSync(attachment.storage_path)) fs.unlinkSync(attachment.storage_path);
  await createTaskActivity({ taskId: task.id, actorUserId: req.user.id, activityType: 'ATTACHMENT_REMOVED', metadata: { attachmentId: attachment.id, originalName: attachment.original_name } });
  res.json({ success: true, message: 'Attachment removed.' });
}

module.exports = { comments, addComment, blockers, addBlocker, updateBlocker, attachments, addAttachment, downloadAttachment, removeAttachment };
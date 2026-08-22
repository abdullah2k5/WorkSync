const pool = require('../config/postgres');
const AppError = require('../utils/AppError');

const priorities = ['normal', 'important', 'urgent'];
const audiences = ['all', 'managers', 'employees'];

const clean = (v) => typeof v === 'string' ? v.trim() : v;

async function profile(userId) {
  const result = await pool.query(
    `SELECT e.id, u.role
     FROM employees e
     JOIN users u ON u.id = e.user_id
     WHERE e.user_id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}

async function row(id) {
  const result = await pool.query(
    `SELECT
       a.*,
       e.first_name || ' ' || e.last_name AS creator_name,
       e.employee_id AS creator_code
     FROM announcements a
     JOIN employees e ON e.id = a.created_by
     WHERE a.id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

function canManage(p) {
  return p && (p.role === 'admin' || p.role === 'manager');
}

async function list(req, res) {
  const result = await pool.query(
    `SELECT
       a.*,
       e.first_name || ' ' || e.last_name AS creator_name,
       e.employee_id AS creator_code
     FROM announcements a
     JOIN employees e ON e.id = a.created_by
     ORDER BY
       CASE a.priority
         WHEN 'urgent' THEN 0
         WHEN 'important' THEN 1
         ELSE 2
       END,
       a.created_at DESC`
  );

  res.json({
    success: true,
    data: result.rows
  });
}

async function mine(req, res) {
  const p = await profile(req.user.id);

  if (!p) {
    throw new AppError('Employee profile not found.', 404);
  }

  const result = await pool.query(
    `SELECT
       a.*,
       e.first_name || ' ' || e.last_name AS creator_name,
       e.employee_id AS creator_code
     FROM announcements a
     JOIN employees e ON e.id = a.created_by
     WHERE a.target_audience = 'all'
        OR a.target_audience = $1
     ORDER BY
       CASE a.priority
         WHEN 'urgent' THEN 0
         WHEN 'important' THEN 1
         ELSE 2
       END,
       a.created_at DESC`,
    [p.role]
  );

  res.json({
    success: true,
    data: result.rows
  });
}

async function detail(req, res) {
  const a = await row(req.params.id);

  if (!a) {
    throw new AppError('Announcement not found.', 404);
  }

  res.json({
    success: true,
    data: a
  });
}

function validate(b) {
  if (!clean(b.title)) {
    throw new AppError('Title is required.', 400);
  }

  if (!clean(b.message)) {
    throw new AppError('Message is required.', 400);
  }

  if (!priorities.includes(b.priority)) {
    throw new AppError('Invalid priority.', 400);
  }

  if (!audiences.includes(b.target_audience)) {
    throw new AppError('Invalid target audience.', 400);
  }
}

async function create(req, res) {
  const p = await profile(req.user.id);

  if (!canManage(p)) {
    throw new AppError(
      'You are not authorized to create announcements.',
      403
    );
  }

  validate(req.body);

  const b = req.body;

  const result = await pool.query(
    `INSERT INTO announcements
       (title, message, priority, target_audience, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      clean(b.title),
      clean(b.message),
      b.priority,
      b.target_audience,
      p.id
    ]
  );

  const created = await row(result.rows[0].id);

  res.status(201).json({
    success: true,
    data: created
  });
}

async function update(req, res) {
  const p = await profile(req.user.id);

  if (!canManage(p)) {
    throw new AppError(
      'You are not authorized to edit announcements.',
      403
    );
  }

  const old = await row(req.params.id);

  if (!old) {
    throw new AppError('Announcement not found.', 404);
  }

  validate(req.body);

  const b = req.body;

  await pool.query(
    `UPDATE announcements
     SET
       title = $1,
       message = $2,
       priority = $3,
       target_audience = $4,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $5`,
    [
      clean(b.title),
      clean(b.message),
      b.priority,
      b.target_audience,
      old.id
    ]
  );

  const updated = await row(old.id);

  res.json({
    success: true,
    data: updated
  });
}

async function remove(req, res) {
  const p = await profile(req.user.id);

  if (!canManage(p)) {
    throw new AppError(
      'You are not authorized to delete announcements.',
      403
    );
  }

  const old = await row(req.params.id);

  if (!old) {
    throw new AppError('Announcement not found.', 404);
  }

  await pool.query(
    'DELETE FROM announcements WHERE id = $1',
    [old.id]
  );

  res.json({
    success: true,
    message: 'Announcement deleted.'
  });
}

module.exports = {
  list,
  mine,
  detail,
  create,
  update,
  remove
};
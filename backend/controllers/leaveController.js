const pool = require('../config/postgres');
const AppError = require('../utils/AppError');
const {
  notifyEmployee,
  notifyManagerOf
} = require('../utils/notificationService');

const types = [
  'Annual Leave',
  'Sick Leave',
  'Casual Leave',
  'Unpaid Leave',
  'Other'
];

async function profile(id) {
  const result = await pool.query(
    `SELECT
       e.id,
       e.manager_id,
       u.role
     FROM employees e
     JOIN users u ON u.id = e.user_id
     WHERE e.user_id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function row(id) {
  const result = await pool.query(
    `SELECT
       l.*,
       l.employee_id AS leave_employee_id,
       e.first_name || ' ' || e.last_name AS employee_name,
       e.employee_id AS employee_code,
       d.name AS department_name,
       r.first_name || ' ' || r.last_name AS reviewer_name,
       (l.end_date - l.start_date + 1) AS days
     FROM leave_requests l
     JOIN employees e ON e.id = l.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employees r ON r.id = l.reviewed_by
     WHERE l.id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function allowed(x, p) {
  if (!p) return false;

  if (p.role === 'admin') {
    return true;
  }

  if (p.role === 'employee') {
    return x.leave_employee_id === p.id;
  }

  if (p.role === 'manager') {
    const result = await pool.query(
      `SELECT id
       FROM employees
       WHERE id = $1
         AND manager_id = $2`,
      [x.leave_employee_id, p.id]
    );

    return result.rows.length > 0;
  }

  return false;
}

async function list(req, res) {
  const p = await profile(req.user.id);

  if (!p) {
    throw new AppError('Employee profile not found.', 404);
  }

  const conditions = [];
  const values = [];

  if (p.role === 'employee') {
    values.push(p.id);
    conditions.push(`l.employee_id = $${values.length}`);
  } else if (p.role === 'manager') {
    values.push(p.id);
    conditions.push(`e.manager_id = $${values.length}`);
  }

  if (req.query.status) {
    values.push(req.query.status);
    conditions.push(`l.status = $${values.length}`);
  }

  if (req.query.leave_type) {
    values.push(req.query.leave_type);
    conditions.push(`l.leave_type = $${values.length}`);
  }

  if (req.query.search) {
    values.push(`%${req.query.search}%`);
    const searchParam = `$${values.length}`;

    conditions.push(
      `(e.first_name || ' ' || e.last_name ILIKE ${searchParam}
        OR e.employee_id ILIKE ${searchParam}
        OR l.leave_type ILIKE ${searchParam})`
    );
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const result = await pool.query(
    `SELECT
       l.*,
       e.first_name || ' ' || e.last_name AS employee_name,
       e.employee_id AS employee_code,
       d.name AS department_name,
       (l.end_date - l.start_date + 1) AS days
     FROM leave_requests l
     JOIN employees e ON e.id = l.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     ${whereClause}
     ORDER BY l.created_at DESC`,
    values
  );

  res.json({
    success: true,
    data: result.rows
  });
}

async function detail(req, res) {
  const x = await row(req.params.id);

  if (!x) {
    throw new AppError('Leave request not found.', 404);
  }

  const p = await profile(req.user.id);

  if (!(await allowed(x, p))) {
    throw new AppError(
      'You are not authorized to access this leave request.',
      403
    );
  }

  res.json({
    success: true,
    data: x
  });
}

async function create(req, res) {
  const p = await profile(req.user.id);
  const b = req.body || {};

  if (!p) {
    throw new AppError('Employee profile not found.', 404);
  }

  if (
    !types.includes(b.leave_type) ||
    !b.start_date ||
    !b.end_date
  ) {
    throw new AppError(
      'Leave type and dates are required.',
      400
    );
  }

  if (b.start_date > b.end_date) {
    throw new AppError(
      'Start date cannot be after end date.',
      400
    );
  }

  const overlap = await pool.query(
    `SELECT id
     FROM leave_requests
     WHERE employee_id = $1
       AND status IN ('Pending', 'Approved')
       AND start_date <= $2
       AND end_date >= $3
     LIMIT 1`,
    [p.id, b.end_date, b.start_date]
  );

  if (overlap.rows.length > 0) {
    throw new AppError(
      'This leave overlaps an existing pending or approved request.',
      409
    );
  }

  const result = await pool.query(
    `INSERT INTO leave_requests
       (employee_id, leave_type, start_date, end_date, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      p.id,
      b.leave_type,
      b.start_date,
      b.end_date,
      typeof b.reason === 'string'
        ? b.reason.trim() || null
        : null
    ]
  );

  const lr = await row(result.rows[0].id);

  try {
    notifyManagerOf(
      lr.leave_employee_id,
      'leave',
      'New Leave Request',
      `${lr.employee_name} has submitted a leave request (${lr.leave_type}, ${lr.start_date} to ${lr.end_date}).`,
      'leave',
      lr.id
    );
  } catch {}

  res.status(201).json({
    success: true,
    data: lr
  });
}

async function cancel(req, res) {
  const p = await profile(req.user.id);
  const x = await row(req.params.id);

  if (!p) {
    throw new AppError('Employee profile not found.', 404);
  }

  if (!x) {
    throw new AppError('Leave request not found.', 404);
  }

  if (x.leave_employee_id !== p.id) {
    throw new AppError(
      'You can only cancel your own leave requests.',
      403
    );
  }

  if (x.status !== 'Pending') {
    throw new AppError(
      'Only pending leave requests can be cancelled.',
      400
    );
  }

  await pool.query(
    `UPDATE leave_requests
     SET
       status = 'Cancelled',
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [x.id]
  );

  const updated = await row(x.id);

  res.json({
    success: true,
    data: updated
  });
}

async function review(req, res) {
  const p = await profile(req.user.id);
  const x = await row(req.params.id);
  const b = req.body || {};

  if (!p) {
    throw new AppError('Employee profile not found.', 404);
  }

  if (!x) {
    throw new AppError('Leave request not found.', 404);
  }

  const teamCheck = await pool.query(
    `SELECT id
     FROM employees
     WHERE id = $1
       AND manager_id = $2`,
    [x.leave_employee_id, p.id]
  );

  if (teamCheck.rows.length === 0) {
    throw new AppError(
      'You can only review requests from your direct team.',
      403
    );
  }

  if (x.status !== 'Pending') {
    throw new AppError(
      'This leave request has already been reviewed.',
      400
    );
  }

  if (!['Approved', 'Rejected'].includes(b.status)) {
    throw new AppError(
      'Status must be Approved or Rejected.',
      400
    );
  }

  if (
    b.status === 'Rejected' &&
    !b.rejection_reason?.trim()
  ) {
    throw new AppError(
      'A rejection reason is required.',
      400
    );
  }

  await pool.query(
    `UPDATE leave_requests
     SET
       status = $1,
       reviewed_by = $2,
       reviewed_at = CURRENT_TIMESTAMP,
       rejection_reason = $3,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [
      b.status,
      p.id,
      b.status === 'Rejected'
        ? b.rejection_reason.trim()
        : null,
      x.id
    ]
  );

  const updated = await row(x.id);

  try {
    if (b.status === 'Approved') {
      notifyEmployee(
        updated.leave_employee_id,
        'leave',
        'Leave Request Approved',
        `Your leave request from ${updated.start_date} to ${updated.end_date} has been approved.`,
        'leave',
        updated.id
      );
    } else {
      notifyEmployee(
        updated.leave_employee_id,
        'leave',
        'Leave Request Rejected',
        `Your leave request from ${updated.start_date} to ${updated.end_date} has been rejected${updated.rejection_reason ? `: ${updated.rejection_reason}` : ''}.`,
        'leave',
        updated.id
      );
    }
  } catch {}

  res.json({
    success: true,
    data: updated
  });
}

async function summary(req, res) {
  const p = await profile(req.user.id);

  if (!p) {
    throw new AppError('Employee profile not found.', 404);
  }

  let where = '';
  const values = [];

  if (p.role === 'employee') {
    values.push(p.id);
    where = `employee_id = $${values.length}`;
  } else if (p.role === 'manager') {
    values.push(p.id);
    where = `employee_id IN (
      SELECT id
      FROM employees
      WHERE manager_id = $${values.length}
    )`;
  }

  const count = async (status) => {
    const statusParam = values.length + 1;

    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM leave_requests
       ${where ? `WHERE ${where} AND` : 'WHERE'}
       status = $${statusParam}`,
      [...values, status]
    );

    return result.rows[0].count;
  };

  const latestResult = await pool.query(
    `SELECT *
     FROM leave_requests
     ${where ? `WHERE ${where}` : ''}
     ORDER BY created_at DESC
     LIMIT 1`,
    values
  );

  res.json({
    success: true,
    data: {
      pending: await count('Pending'),
      approved: await count('Approved'),
      rejected: await count('Rejected'),
      latest: latestResult.rows[0] || null
    }
  });
}

module.exports = {
  list,
  detail,
  create,
  cancel,
  review,
  summary
};
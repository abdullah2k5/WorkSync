const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { notifyEmployee } = require('../utils/notificationService');
const { createTaskActivity } = require('../utils/taskActivityService');
const { getDeadlineCounts } = require('../utils/deadlineService');

const priorities = ['Low', 'Medium', 'High'];
const statuses = ['To Do', 'In Progress', 'Completed'];

async function profile(userId) {
  const result = await pool.query(
    'SELECT e.id, e.manager_id, u.role FROM employees e JOIN users u ON u.id = e.user_id WHERE e.user_id = $1',
    [userId]
  );
  return result.rows[0];
}

async function task(id) {
  const result = await pool.query(
    `SELECT t.*,
       a.first_name || ' ' || a.last_name AS assigned_name,
       c.first_name || ' ' || c.last_name AS creator_name,
       d.name AS department_name
     FROM tasks t
     JOIN employees a ON a.id = t.assigned_to
     JOIN employees c ON c.id = t.created_by
     LEFT JOIN departments d ON d.id = a.department_id
     WHERE t.id = $1`,
    [id]
  );
  return result.rows[0];
}

async function inTeam(id, manager) {
  const result = await pool.query('SELECT id FROM employees WHERE id = $1 AND manager_id = $2', [id, manager]);
  return result.rows[0];
}

async function canView(t, p) {
  if (p.role === 'admin') return true;
  if (p.role === 'manager') {
    if (t.created_by === p.id) return true;
    if (t.assigned_to) {
      const member = await inTeam(t.assigned_to, p.id);
      return Boolean(member);
    }
    return false;
  }
  return p.role === 'employee' && t.assigned_to === p.id;
}

async function list(req, res) {
  const p = await profile(req.user.id);
  const w = [];
  const v = [];
  if (p.role === 'manager') {
    w.push('(t.created_by = $1 OR a.manager_id = $2)');
    v.push(p.id, p.id);
  } else if (p.role === 'employee') {
    w.push('t.assigned_to = $1');
    v.push(p.id);
  }
  if (req.query.status) {
    w.push(`t.status = $${v.length + 1}`);
    v.push(req.query.status);
  }
  if (req.query.priority) {
    w.push(`t.priority = $${v.length + 1}`);
    v.push(req.query.priority);
  }
  if (req.query.label_id) {
    w.push(`EXISTS (SELECT 1 FROM task_labels filter_tl WHERE filter_tl.task_id = t.id AND filter_tl.label_id = $${v.length + 1})`);
    v.push(req.query.label_id);
  }
  if (req.query.search) {
    w.push(`(t.title ILIKE $${v.length + 1} OR t.description ILIKE $${v.length + 2})`);
    v.push(`%${req.query.search}%`, `%${req.query.search}%`);
  }
  const sql = `SELECT t.*, a.first_name || ' ' || a.last_name AS assigned_name, c.first_name || ' ' || c.last_name AS creator_name
     FROM tasks t
     JOIN employees a ON a.id = t.assigned_to
     JOIN employees c ON c.id = t.created_by
     ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
     ORDER BY t.due_date`;
  const result = await pool.query(sql, v);
  res.json({ success: true, data: result.rows });
}

async function detail(req, res) {
  const t = await task(req.params.id);
  if (!t) throw new AppError('Task not found.', 404);
  const p = await profile(req.user.id);
  if (!(await canView(t, p))) throw new AppError('You are not authorized to access this task.', 403);
  res.json({ success: true, data: t });
}

function validate(b) {
  if (!b.title?.trim() || !b.assigned_to || !b.due_date) throw new AppError('Title, assignee, and due date are required.', 400);
  if (!priorities.includes(b.priority)) throw new AppError('Invalid priority.', 400);
  if (Number.isNaN(Date.parse(b.due_date))) throw new AppError('Invalid due date.', 400);
}

async function create(req, res) {
  const p = await profile(req.user.id);
  validate(req.body);
  if (!(await inTeam(req.body.assigned_to, p.id))) throw new AppError('Tasks can only be assigned to your team.', 403);
  const b = req.body;
  const inserted = await pool.query(
    'INSERT INTO tasks(title,description,assigned_to,created_by,priority,due_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
    [b.title.trim(), b.description?.trim() || null, b.assigned_to, p.id, b.priority, b.due_date]
  );
  const t = await task(inserted.rows[0].id);
  await createTaskActivity({ taskId: t.id, actorUserId: req.user.id, activityType: 'TASK_CREATED', newValue: t.title });
  await createTaskActivity({ taskId: t.id, actorUserId: req.user.id, activityType: 'TASK_ASSIGNED', newValue: String(t.assigned_to) });
  const creator = await pool.query("SELECT first_name || ' ' || last_name AS full_name FROM employees WHERE id = $1", [p.id]);
  const creatorName = creator.rows[0]?.full_name || 'Manager';
  const taskTitle = `Task assigned by ${creatorName}`;
  const taskMessage = `You have been assigned a new task by ${creatorName}: ${t.title}`;
  try {
    await notifyEmployee(t.assigned_to, 'task', taskTitle, taskMessage, 'task', t.id);
  } catch {}
  res.status(201).json({ success: true, data: t });
}

async function edit(req, res) {
  const p = await profile(req.user.id);
  const old = await task(req.params.id);
  if (!old) throw new AppError('Task not found.', 404);
  if (old.created_by !== p.id) throw new AppError('Only the task creator can edit this task.', 403);
  validate(req.body);
  if (!(await inTeam(req.body.assigned_to, p.id))) throw new AppError('Tasks can only be assigned to your team.', 403);
  const b = req.body;
  const title = b.title.trim();
  const description = b.description?.trim() || null;
  const changedAssignee = Number(old.assigned_to) !== Number(b.assigned_to);
  const changes = [];
  if (old.priority !== b.priority) changes.push({ type: 'PRIORITY_CHANGED', oldValue: old.priority, newValue: b.priority, message: `priority changed to ${b.priority}` });
  if (String(old.due_date).slice(0, 10) !== String(b.due_date).slice(0, 10)) changes.push({ type: 'DUE_DATE_CHANGED', oldValue: old.due_date, newValue: b.due_date, message: `due date changed to ${b.due_date}` });
  if ((old.description || '') !== (description || '')) changes.push({ type: 'DETAILS_UPDATED', oldValue: old.description || '', newValue: description || '', message: 'description updated' });
  if (old.title !== title) changes.push({ type: 'DETAILS_UPDATED', oldValue: 'title', newValue: title, message: 'title updated' });
  await pool.query('UPDATE tasks SET title=$1,description=$2,assigned_to=$3,priority=$4,due_date=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$6', [
    title,
    description,
    b.assigned_to,
    b.priority,
    b.due_date,
    old.id
  ]);
  for (const change of changes) {
    await createTaskActivity({ taskId: old.id, actorUserId: req.user.id, activityType: change.type, oldValue: change.oldValue, newValue: change.newValue });
  }
  if (changedAssignee) {
    await createTaskActivity({ taskId: old.id, actorUserId: req.user.id, activityType: 'TASK_REASSIGNED', oldValue: String(old.assigned_to), newValue: String(b.assigned_to) });
    try {
      await notifyEmployee(old.assigned_to, 'task', 'Task assignment changed', `The task "${old.title}" is no longer assigned to you.`, 'task', old.id);
      await notifyEmployee(b.assigned_to, 'task', 'Task assigned to you', `You have been assigned the task "${old.title}".`, 'task', old.id);
    } catch {}
  }
  if (changes.length) {
    const message = `The task "${old.title}" was updated: ${changes.map((change) => change.message).join(', ')}.`;
    try {
      await notifyEmployee(b.assigned_to, 'task', 'Task details updated', message, 'task', old.id);
      if (Number(b.assigned_to) !== Number(p.id)) await notifyEmployee(p.id, 'task', 'Task details updated', message, 'task', old.id);
    } catch {}
  }
  res.json({ success: true, data: await task(old.id) });
}

async function progress(req, res) {
  const p = await profile(req.user.id);
  const t = await task(req.params.id);
  const b = req.body || {};
  if (!t) throw new AppError('Task not found.', 404);
  if (t.assigned_to !== p.id) throw new AppError('You can only update your own tasks.', 403);
  if (!statuses.includes(b.status) || !Number.isInteger(b.progress) || b.progress < 0 || b.progress > 100) {
    throw new AppError('Invalid status or progress.', 400);
  }
  const n = b.status === 'Completed' ? 100 : b.progress;
  if (b.status === 'To Do' && n !== 0) throw new AppError('To Do tasks must have 0% progress.', 400);
  if (b.status === 'In Progress' && (n < 1 || n > 99)) throw new AppError('In Progress tasks must be between 1% and 99%.', 400);
  await pool.query('UPDATE tasks SET status=$1,progress=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3', [b.status, n, t.id]);
  if (t.status !== b.status) {
    await createTaskActivity({ taskId: t.id, actorUserId: req.user.id, activityType: 'STATUS_CHANGED', oldValue: t.status, newValue: b.status });
  }
  if (t.progress !== n) {
    await createTaskActivity({ taskId: t.id, actorUserId: req.user.id, activityType: 'PROGRESS_CHANGED', oldValue: String(t.progress), newValue: String(n) });
  }
  if (b.status === 'Completed' && t.status !== 'Completed') {
    await createTaskActivity({ taskId: t.id, actorUserId: req.user.id, activityType: 'TASK_COMPLETED' });
    try {
      await notifyEmployee(t.created_by, 'task', 'Task Completed', `The task "${t.title}" has been completed by the assigned employee.`, 'task', t.id);
    } catch {}
  }
  res.json({ success: true, data: await task(t.id) });
}

async function remove(req, res) {
  const p = await profile(req.user.id);
  const t = await task(req.params.id);
  if (!t) throw new AppError('Task not found.', 404);
  if (t.created_by !== p.id) throw new AppError('Only the task creator can delete this task.', 403);
  await pool.query('DELETE FROM tasks WHERE id = $1', [t.id]);
  res.json({ success: true, message: 'Task deleted.' });
}

async function team(req, res) {
  const p = await profile(req.user.id);
  const result = await pool.query(
    'SELECT e.id, e.first_name, e.last_name, e.employee_id, e.job_position FROM employees e JOIN users u ON u.id = e.user_id WHERE e.manager_id = $1 AND u.is_active = 1 ORDER BY e.first_name',
    [p.id]
  );
  res.json({ success: true, data: result.rows });
}

async function stats(req, res) {
  const p = await profile(req.user.id);
  const base =
    p.role === 'admin'
      ? { sql: '', params: [] }
      : p.role === 'manager'
        ? { sql: ' WHERE (t.created_by = $1 OR a.manager_id = $2)', params: [p.id, p.id] }
        : { sql: ' WHERE t.assigned_to = $1', params: [p.id] };
  const count = async (extra = '') => {
    const result = await pool.query(
      `SELECT COUNT(*)::integer AS count FROM tasks t JOIN employees a ON a.id = t.assigned_to${base.sql}${extra}`,
      base.params
    );
    return result.rows[0].count;
  };
  const join = base.sql ? ' AND ' : ' WHERE ';
  res.json({
    success: true,
    data: {
      total: await count(),
      todo: await count(`${join}t.status = 'To Do'`),
      inProgress: await count(`${join}t.status = 'In Progress'`),
      completed: await count(`${join}t.status = 'Completed'`),
      overdue: await count(`${join}t.due_date < CURRENT_DATE AND t.status != 'Completed'`),
      ...(await getDeadlineCounts({ role: p.role, employeeId: p.id }))
    }
  });
}

async function employeeDashboard(req, res) {
  const p = await profile(req.user.id);
  if (!p || p.role !== 'employee') throw new AppError('Employee access is required.', 403);
  const count = async (condition = '') => {
    const result = await pool.query(`SELECT COUNT(*)::integer AS count FROM tasks WHERE assigned_to = $1${condition}`, [p.id]);
    return result.rows[0].count;
  };
  const recent = await pool.query(
    'SELECT id,title,priority,status,progress,due_date,created_at FROM tasks WHERE assigned_to = $1 ORDER BY updated_at DESC,created_at DESC LIMIT 5',
    [p.id]
  );
  const deadlines = await getDeadlineCounts({ role: 'employee', employeeId: p.id });
  res.json({
    success: true,
    data: {
      totalTasks: await count(),
      todoTasks: await count(" AND status = 'To Do'"),
      inProgressTasks: await count(" AND status = 'In Progress'"),
      completedTasks: await count(" AND status = 'Completed'"),
      overdueTasks: await count(" AND due_date < CURRENT_DATE AND status != 'Completed'"),
      dueToday: deadlines.dueToday,
      dueThisWeek: deadlines.dueThisWeek,
      recentTasks: recent.rows
    }
  });
}

module.exports = { list, detail, create, edit, progress, remove, team, stats, employeeDashboard, canView, getTask: task, getProfile: profile };
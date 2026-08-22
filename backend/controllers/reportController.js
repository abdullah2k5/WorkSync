const pool = require('../config/database');
const AppError = require('../utils/AppError');

async function profile(userId) {
  const result = await pool.query(
    'SELECT e.id, e.manager_id, u.role FROM employees e JOIN users u ON u.id = e.user_id WHERE e.user_id = $1',
    [userId]
  );
  return result.rows[0];
}

function scope(p) {
  if (!p) throw new AppError('Employee profile not found.', 404);
  if (p.role === 'employee') throw new AppError('You are not authorized to access reports.', 403);
  // p.id originates from the database identity column (integer), safe to inline.
  return p.role === 'manager' ? ` AND (e.manager_id=${Number(p.id)} OR e.id=${Number(p.id)})` : '';
}

function buildTaskFilters(req, offset = 0) {
  const { start_date, end_date, department_id, employee_id, task_status } = req.query;
  const w = [];
  const v = [];
  if (start_date) {
    w.push(`t.created_at::date >= $${offset + v.length + 1}`);
    v.push(start_date);
  }
  if (end_date) {
    w.push(`t.created_at::date <= $${offset + v.length + 1}`);
    v.push(end_date);
  }
  if (department_id) {
    w.push(`e.department_id = $${offset + v.length + 1}`);
    v.push(department_id);
  }
  if (employee_id) {
    w.push(`t.assigned_to = $${offset + v.length + 1}`);
    v.push(employee_id);
  }
  if (task_status) {
    if (task_status === 'Overdue') {
      w.push("t.status != 'Completed' AND t.due_date < CURRENT_DATE");
    } else {
      w.push(`t.status = $${offset + v.length + 1}`);
      v.push(task_status);
    }
  }
  return { w, v };
}

function buildLeaveFilters(req, offset = 0) {
  const { start_date, end_date, department_id, employee_id } = req.query;
  const w = [];
  const v = [];
  if (start_date) {
    w.push(`l.created_at::date >= $${offset + v.length + 1}`);
    v.push(start_date);
  }
  if (end_date) {
    w.push(`l.created_at::date <= $${offset + v.length + 1}`);
    v.push(end_date);
  }
  if (department_id) {
    w.push(`e.department_id = $${offset + v.length + 1}`);
    v.push(department_id);
  }
  if (employee_id) {
    w.push(`l.employee_id = $${offset + v.length + 1}`);
    v.push(employee_id);
  }
  return { w, v };
}

function buildEmployeeFilters(req, offset = 0) {
  const { department_id } = req.query;
  const w = [];
  const v = [];
  if (department_id) {
    w.push(`e.department_id = $${offset + v.length + 1}`);
    v.push(department_id);
  }
  return { w, v };
}

function cond(w) {
  return w.length ? ' AND ' + w.join(' AND ') : '';
}

async function summary(req, res) {
  const p = await profile(req.user.id);
  const sc = scope(p);
  const tf = buildTaskFilters(req);
  const lf = buildLeaveFilters(req);
  const ef = buildEmployeeFilters(req);
  const tc = cond(tf.w);
  const lc = cond(lf.w);
  const ec = cond(ef.w);
  const q = async (sql, params) => (await pool.query(sql, params)).rows[0].count;
  const employees = await q(`SELECT COUNT(*)::integer AS count FROM employees e JOIN users u ON u.id=e.user_id WHERE 1=1${sc}${ec}`, ef.v);
  const activeEmployees = await q(`SELECT COUNT(*)::integer AS count FROM employees e JOIN users u ON u.id=e.user_id WHERE u.is_active=1${sc}${ec}`, ef.v);
  const inactiveEmployees = await q(`SELECT COUNT(*)::integer AS count FROM employees e JOIN users u ON u.id=e.user_id WHERE u.is_active=0${sc}${ec}`, ef.v);
  const departments = await q(`SELECT COUNT(DISTINCT d.id)::integer AS count FROM departments d JOIN employees e ON e.department_id=d.id WHERE 1=1${sc}${ec}`, ef.v);
  const totalTasks = await q(`SELECT COUNT(*)::integer AS count FROM tasks t JOIN employees e ON e.id=t.assigned_to WHERE 1=1${sc}${tc}`, tf.v);
  const completedTasks = await q(`SELECT COUNT(*)::integer AS count FROM tasks t JOIN employees e ON e.id=t.assigned_to WHERE 1=1${sc}${tc} AND t.status='Completed'`, tf.v);
  const inProgressTasks = await q(`SELECT COUNT(*)::integer AS count FROM tasks t JOIN employees e ON e.id=t.assigned_to WHERE 1=1${sc}${tc} AND t.status='In Progress'`, tf.v);
  const pendingTasks = await q(`SELECT COUNT(*)::integer AS count FROM tasks t JOIN employees e ON e.id=t.assigned_to WHERE 1=1${sc}${tc} AND t.status='To Do'`, tf.v);
  const overdueTasks = await q(`SELECT COUNT(*)::integer AS count FROM tasks t JOIN employees e ON e.id=t.assigned_to WHERE 1=1${sc}${tc} AND t.status!='Completed' AND t.due_date<CURRENT_DATE`, tf.v);
  const totalLeaves = await q(`SELECT COUNT(*)::integer AS count FROM leave_requests l JOIN employees e ON e.id=l.employee_id WHERE 1=1${sc}${lc}`, lf.v);
  const approvedLeaves = await q(`SELECT COUNT(*)::integer AS count FROM leave_requests l JOIN employees e ON e.id=l.employee_id WHERE 1=1${sc}${lc} AND l.status='Approved'`, lf.v);
  const rejectedLeaves = await q(`SELECT COUNT(*)::integer AS count FROM leave_requests l JOIN employees e ON e.id=l.employee_id WHERE 1=1${sc}${lc} AND l.status='Rejected'`, lf.v);
  const pendingLeaves = await q(`SELECT COUNT(*)::integer AS count FROM leave_requests l JOIN employees e ON e.id=l.employee_id WHERE 1=1${sc}${lc} AND l.status='Pending'`, lf.v);
  res.json({
    success: true,
    data: {
      employees: { total: employees, active: activeEmployees, inactive: inactiveEmployees, departments },
      tasks: { total: totalTasks, completed: completedTasks, inProgress: inProgressTasks, pending: pendingTasks, overdue: overdueTasks },
      leaves: { total: totalLeaves, approved: approvedLeaves, rejected: rejectedLeaves, pending: pendingLeaves }
    }
  });
}

async function tasks(req, res) {
  const p = await profile(req.user.id);
  const sc = scope(p);
  const { w, v } = buildTaskFilters(req);
  const result = await pool.query(
    `SELECT t.id,t.title,t.status,t.priority,t.due_date,t.created_at,t.updated_at,t.progress,
       e.first_name||' '||e.last_name assigned_name,c.first_name||' '||c.last_name creator_name,d.name department_name
     FROM tasks t
     JOIN employees e ON e.id=t.assigned_to
     JOIN employees c ON c.id=t.created_by
     LEFT JOIN departments d ON d.id=e.department_id
     WHERE 1=1${sc}${cond(w)} ORDER BY t.due_date`,
    v
  );
  res.json({ success: true, data: result.rows });
}

async function leaves(req, res) {
  const p = await profile(req.user.id);
  const sc = scope(p);
  const { w, v } = buildLeaveFilters(req);
  const result = await pool.query(
    `SELECT l.id,l.leave_type,l.start_date,l.end_date,l.status,l.created_at,l.reviewed_at,
       e.first_name||' '||e.last_name employee_name,d.name department_name,r.first_name||' '||r.last_name reviewer_name
     FROM leave_requests l
     JOIN employees e ON e.id=l.employee_id
     LEFT JOIN departments d ON d.id=e.department_id
     LEFT JOIN employees r ON r.id=l.reviewed_by
     WHERE 1=1${sc}${cond(w)} ORDER BY l.created_at DESC`,
    v
  );
  res.json({ success: true, data: result.rows });
}

async function employees(req, res) {
  const p = await profile(req.user.id);
  const sc = scope(p);
  const { w, v } = buildEmployeeFilters(req);
  const result = await pool.query(
    `SELECT e.id,e.first_name||' '||e.last_name employee_name,u.email,e.job_position,u.role,d.name department_name,u.is_active,
       (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to=e.id) assigned_tasks,
       (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to=e.id AND t.status='Completed') completed_tasks
     FROM employees e
     JOIN users u ON u.id=e.user_id
     LEFT JOIN departments d ON d.id=e.department_id
     WHERE 1=1${sc}${cond(w)} ORDER BY e.first_name`,
    v
  );
  res.json({ success: true, data: result.rows });
}

async function chartData(req, res) {
  const p = await profile(req.user.id);
  const sc = scope(p);
  const tf = buildTaskFilters(req);
  const lf = buildLeaveFilters(req);
  const ef = buildEmployeeFilters(req);
  // Combined task+employee filters need continuous parameter numbering.
  const efMerged = buildEmployeeFilters(req, tf.v.length);
  const tc = cond(tf.w);
  const lc = cond(lf.w);
  const ec = cond(ef.w);
  const tcEc = cond([...tf.w, ...efMerged.w]);
  const taskStatus = await pool.query(
    `SELECT t.status,COUNT(*)::integer AS count FROM tasks t JOIN employees e ON e.id=t.assigned_to WHERE 1=1${sc}${tc} GROUP BY t.status`,
    tf.v
  );
  const overdue = await pool.query(
    `SELECT COUNT(*)::integer AS count FROM tasks t JOIN employees e ON e.id=t.assigned_to WHERE 1=1${sc}${tc} AND t.status!='Completed' AND t.due_date<CURRENT_DATE`,
    tf.v
  );
  const tasksByEmployee = await pool.query(
    `SELECT e.first_name||' '||e.last_name employee_name,COUNT(t.id)::integer AS total,
       SUM(CASE WHEN t.status='Completed' THEN 1 ELSE 0 END)::integer AS completed
     FROM employees e
     LEFT JOIN tasks t ON t.assigned_to=e.id
     WHERE 1=1${sc}${tcEc} GROUP BY e.id ORDER BY total DESC LIMIT 10`,
    [...tf.v, ...efMerged.v]
  );
  const leaveStatus = await pool.query(
    `SELECT l.status,COUNT(*)::integer AS count FROM leave_requests l JOIN employees e ON e.id=l.employee_id WHERE 1=1${sc}${lc} GROUP BY l.status`,
    lf.v
  );
  const employeesByDept = await pool.query(
    `SELECT d.name department_name,COUNT(e.id)::integer AS count FROM departments d LEFT JOIN employees e ON e.department_id=d.id WHERE 1=1${sc}${ec} GROUP BY d.id ORDER BY count DESC`,
    ef.v
  );
  res.json({
    success: true,
    data: {
      taskStatus: taskStatus.rows,
      overdue: overdue.rows[0].count,
      tasksByEmployee: tasksByEmployee.rows,
      leaveStatus: leaveStatus.rows,
      employeesByDept: employeesByDept.rows
    }
  });
}

async function meta(req, res) {
  const p = await profile(req.user.id);
  const sc = scope(p);
  const departments = await pool.query(
    `SELECT DISTINCT d.id,d.name FROM departments d LEFT JOIN employees e ON e.department_id=d.id WHERE 1=1${sc} ORDER BY d.name`
  );
  const employees = await pool.query(
    `SELECT e.id,e.first_name||' '||e.last_name employee_name FROM employees e JOIN users u ON u.id=e.user_id WHERE 1=1${sc} ORDER BY e.first_name`
  );
  res.json({ success: true, data: { departments: departments.rows, employees: employees.rows } });
}

module.exports = { summary, tasks, leaves, employees, chartData, meta };
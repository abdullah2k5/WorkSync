const db = require('../config/database');
const { notifyEmployee } = require('./notificationService');

function localDateParts(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateParts(date);
}

function weekStart(value) {
  const date = new Date(`${value}T00:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return localDateParts(date);
}

function getDeadlineCounts(scope = {}) {
  const today = localDateParts();
  const weekEnd = addDays(weekStart(today), 6);
  const where = ["t.due_date IS NOT NULL"];
  const params = [];
  if (scope.role === 'employee') {
    where.push('t.assigned_to=?');
    params.push(scope.employeeId);
  } else if (scope.role === 'manager') {
    where.push('(t.created_by=? OR a.manager_id=?)');
    params.push(scope.employeeId, scope.employeeId);
  }
  const base = where.join(' AND ');
  const count = (condition, ...values) => db.prepare(`SELECT COUNT(*) AS count FROM tasks t JOIN employees a ON a.id=t.assigned_to WHERE ${base} AND t.status!='Completed' AND ${condition}`).get(...params, ...values).count;
  return {
    dueToday: count('t.due_date=?', today),
    dueThisWeek: count('t.due_date>=? AND t.due_date<=?', today, weekEnd),
    overdue: count('t.due_date<?', today),
  };
}

function processDeadlineNotifications() {
  const today = localDateParts();
  const tomorrow = addDays(today, 1);
  const tasks = db.prepare(`
    SELECT t.id, t.title, t.due_date, t.assigned_to, t.created_by,
      ae.first_name || ' ' || ae.last_name AS assigned_name
    FROM tasks t
    JOIN employees ae ON ae.id=t.assigned_to
    WHERE t.due_date IS NOT NULL AND t.status!='Completed'
      AND t.due_date<=?
  `).all(tomorrow);

  for (const task of tasks) {
    if (task.due_date === tomorrow) {
      try { notifyEmployee(task.assigned_to, 'task', 'Upcoming task deadline', `Your task "${task.title}" is due tomorrow.`, 'task', task.id); } catch (error) { console.error('Deadline notification failed', error); }
    } else if (task.due_date === today) {
      try { notifyEmployee(task.assigned_to, 'task', 'Task due today', `Your task "${task.title}" is due today.`, 'task', task.id); } catch (error) { console.error('Deadline notification failed', error); }
    } else if (task.due_date < today) {
      try { notifyEmployee(task.assigned_to, 'task', 'Task overdue', `The task "${task.title}" is overdue.`, 'task', task.id); } catch (error) { console.error('Deadline notification failed', error); }
      if (Number(task.created_by) !== Number(task.assigned_to)) {
        try { notifyEmployee(task.created_by, 'task', 'Task overdue', `"${task.title}" assigned to ${task.assigned_name} is overdue.`, 'task', task.id); } catch (error) { console.error('Deadline notification failed', error); }
      }
    }
  }
}

module.exports = { localDateParts, getDeadlineCounts, processDeadlineNotifications };

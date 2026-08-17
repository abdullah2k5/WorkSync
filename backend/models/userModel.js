const db = require('../config/database');

function findByEmail(email) {
  return db.prepare('SELECT id, email, password, role, is_active, must_change_password, created_at, updated_at FROM users WHERE email = ?').get(email);
}

function findById(id) {
  return db.prepare('SELECT id, email, role, is_active, must_change_password, created_at, updated_at FROM users WHERE id = ?').get(id);
}

function findEmployeeByUserId(userId) {
  return db.prepare(`
    SELECT e.id, e.employee_id, e.first_name, e.last_name, e.phone, e.job_position, e.joining_date,
      e.profile_picture, d.id AS department_id, d.name AS department_name,
      manager.id AS manager_id, manager.first_name || ' ' || manager.last_name AS manager_name
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN employees manager ON manager.id = e.manager_id
    WHERE e.user_id = ?
  `).get(userId);
}

module.exports = { findByEmail, findById, findEmployeeByUserId };

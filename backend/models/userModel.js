const pool = require('../config/database');

async function findByEmail(email) {
  const result = await pool.query(
    `SELECT
      id,
      email,
      password,
      role,
      is_active,
      must_change_password,
      created_at,
      updated_at
    FROM users
    WHERE email = $1`,
    [email]
  );

  return result.rows[0] || null;
}

async function findById(id) {
  const result = await pool.query(
    `SELECT
      id,
      email,
      role,
      is_active,
      must_change_password,
      created_at,
      updated_at
    FROM users
    WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function findEmployeeByUserId(userId) {
  const result = await pool.query(
    `SELECT
      e.id,
      e.employee_id,
      e.first_name,
      e.last_name,
      e.phone,
      e.job_position,
      e.joining_date,
      e.profile_picture,
      d.id AS department_id,
      d.name AS department_name,
      manager.id AS manager_id,
      manager.first_name || ' ' || manager.last_name AS manager_name
    FROM employees e
    LEFT JOIN departments d
      ON d.id = e.department_id
    LEFT JOIN employees manager
      ON manager.id = e.manager_id
    WHERE e.user_id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}

module.exports = {
  findByEmail,
  findById,
  findEmployeeByUserId
};
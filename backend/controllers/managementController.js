const pool = require('../config/postgres');
const bcrypt = require('bcrypt');
const AppError = require('../utils/AppError');
const { generateTemporaryPassword } = require('../utils/temporaryPassword');

const clean = (v) => typeof v === 'string' ? v.trim() : v;

const departmentById = async (id) => {
  const result = await pool.query(
    `SELECT id, name, description, created_at, updated_at
     FROM departments
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
};

const employeeById = async (id) => {
  const result = await pool.query(
    `SELECT
       e.*,
       u.email,
       u.role,
       u.is_active,
       d.name AS department_name,
       m.first_name || ' ' || m.last_name AS manager_name
     FROM employees e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employees m ON m.id = e.manager_id
     WHERE e.id = $1`,
    [id]
  );

  return result.rows[0] || null;
};

async function departments(req, res) {
  const result = await pool.query(
    `SELECT
       d.*,
       COUNT(e.id)::integer AS employee_count
     FROM departments d
     LEFT JOIN employees e ON e.department_id = d.id
     GROUP BY d.id
     ORDER BY d.name`
  );

  res.json({
    success: true,
    data: result.rows
  });
}

async function department(req, res) {
  const row = await departmentById(req.params.id);

  if (!row) {
    throw new AppError('Department not found.', 404);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::integer AS count
     FROM employees
     WHERE department_id = $1`,
    [req.params.id]
  );

  res.json({
    success: true,
    data: {
      ...row,
      employee_count: countResult.rows[0].count
    }
  });
}

async function createDepartment(req, res) {
  const name = clean(req.body?.name);

  if (!name) {
    throw new AppError('Department name is required.', 400);
  }

  try {
    const result = await pool.query(
      `INSERT INTO departments (name, description)
       VALUES ($1, $2)
       RETURNING id`,
      [
        name,
        clean(req.body.description) || null
      ]
    );

    const created = await departmentById(result.rows[0].id);

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (e) {
    if (e.code === '23505') {
      throw new AppError('Department name must be unique.', 409);
    }

    throw e;
  }
}

async function updateDepartment(req, res) {
  const name = clean(req.body?.name);

  if (!name) {
    throw new AppError('Department name is required.', 400);
  }

  if (!await departmentById(req.params.id)) {
    throw new AppError('Department not found.', 404);
  }

  try {
    await pool.query(
      `UPDATE departments
       SET name = $1,
           description = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        name,
        clean(req.body.description) || null,
        req.params.id
      ]
    );

    res.json({
      success: true,
      data: await departmentById(req.params.id)
    });
  } catch (e) {
    if (e.code === '23505') {
      throw new AppError('Department name must be unique.', 409);
    }

    throw e;
  }
}

async function deleteDepartment(req, res) {
  if (!await departmentById(req.params.id)) {
    throw new AppError('Department not found.', 404);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::integer AS count
     FROM employees
     WHERE department_id = $1`,
    [req.params.id]
  );

  if (countResult.rows[0].count > 0) {
    throw new AppError(
      'This department cannot be deleted because employees are assigned to it.',
      409
    );
  }

  await pool.query(
    `DELETE FROM departments WHERE id = $1`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: 'Department deleted.'
  });
}

async function employees(req, res) {
  const {
    search,
    department_id,
    status
  } = req.query;

  const where = [];
  const params = [];

  if (search) {
    where.push(
      `(e.first_name ILIKE $${params.length + 1}
        OR e.last_name ILIKE $${params.length + 1}
        OR e.employee_id ILIKE $${params.length + 1}
        OR u.email ILIKE $${params.length + 1})`
    );

    params.push(`%${search}%`);
  }

  if (department_id) {
    where.push(`e.department_id = $${params.length + 1}`);
    params.push(department_id);
  }

  if (status === 'active' || status === 'inactive') {
    where.push(`u.is_active = $${params.length + 1}`);
    params.push(status === 'active' ? 1 : 0);
  }

  const sql = `
    SELECT
      e.id,
      e.employee_id,
      e.first_name,
      e.last_name,
      e.job_position,
      e.joining_date,
      e.profile_picture,
      u.email,
      u.role,
      u.is_active,
      d.name AS department_name,
      m.first_name || ' ' || m.last_name AS manager_name
    FROM employees e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN employees m ON m.id = e.manager_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY e.first_name, e.last_name
  `;

  const result = await pool.query(sql, params);

  res.json({
    success: true,
    data: result.rows
  });
}

async function employee(req, res) {
  const row = await employeeById(req.params.id);

  if (!row) {
    throw new AppError('Employee not found.', 404);
  }

  res.json({
    success: true,
    data: row
  });
}

async function validateEmployee(body, id) {
  const required = [
    'first_name',
    'last_name',
    'employee_id',
    'email',
    'job_position',
    'joining_date'
  ];

  for (const field of required) {
    if (!clean(body[field])) {
      throw new AppError(
        `${field.replace('_', ' ')} is required.`,
        400
      );
    }
  }

  if (body.department_id) {
    if (!await departmentById(body.department_id)) {
      throw new AppError('Invalid department.', 400);
    }
  }

  if (body.manager_id) {
    if (Number(body.manager_id) === Number(id)) {
      throw new AppError(
        'An employee cannot be their own manager.',
        400
      );
    }

    const manager = await employeeById(body.manager_id);

    if (!manager || manager.role !== 'manager') {
      throw new AppError('Invalid manager.', 400);
    }
  }
}

async function createEmployee(req, res) {
  const b = req.body || {};

  await validateEmployee(b);

  if (!clean(b.password)) {
    throw new AppError('Temporary password is required.', 400);
  }

  if (!['manager', 'employee'].includes(b.role || 'employee')) {
    throw new AppError(
      'Role must be manager or employee.',
      400
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (
         email,
         password,
         role
       )
       VALUES ($1, $2, $3)
       RETURNING id`,
      [
        clean(b.email).toLowerCase(),
        await bcrypt.hash(b.password, 12),
        b.role || 'employee'
      ]
    );

    const employeeResult = await client.query(
      `INSERT INTO employees (
         user_id,
         employee_id,
         first_name,
         last_name,
         department_id,
         manager_id,
         job_position,
         joining_date,
         profile_picture
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        userResult.rows[0].id,
        clean(b.employee_id),
        clean(b.first_name),
        clean(b.last_name),
        b.department_id || null,
        b.manager_id || null,
        clean(b.job_position),
        b.joining_date,
        b.profile_picture || null
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: await employeeById(employeeResult.rows[0].id)
    });
  } catch (e) {
    await client.query('ROLLBACK');

    if (e.code === '23505') {
      throw new AppError(
        'Email or employee ID already exists.',
        409
      );
    }

    throw e;
  } finally {
    client.release();
  }
}

async function updateEmployee(req, res) {
  const old = await employeeById(req.params.id);

  if (!old) {
    throw new AppError('Employee not found.', 404);
  }

  const b = {
    ...old,
    ...req.body
  };

  await validateEmployee(b, req.params.id);

  try {
    await pool.query(
      `UPDATE employees
       SET employee_id = $1,
           first_name = $2,
           last_name = $3,
           department_id = $4,
           manager_id = $5,
           job_position = $6,
           joining_date = $7,
           profile_picture = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9`,
      [
        clean(b.employee_id),
        clean(b.first_name),
        clean(b.last_name),
        b.department_id || null,
        b.manager_id || null,
        clean(b.job_position),
        b.joining_date,
        b.profile_picture || null,
        req.params.id
      ]
    );

    res.json({
      success: true,
      data: await employeeById(req.params.id)
    });
  } catch (e) {
    if (e.code === '23505') {
      throw new AppError(
        'Employee ID already exists.',
        409
      );
    }

    throw e;
  }
}

async function status(req, res) {
  const row = await employeeById(req.params.id);

  if (!row) {
    throw new AppError('Employee not found.', 404);
  }

  if (Number(row.user_id) === Number(req.user.id)) {
    throw new AppError(
      'You cannot deactivate your own account.',
      400
    );
  }

  if (typeof req.body?.is_active !== 'boolean') {
    throw new AppError(
      'is_active must be boolean.',
      400
    );
  }

  await pool.query(
    `UPDATE users
     SET is_active = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [
      req.body.is_active ? 1 : 0,
      row.user_id
    ]
  );

  res.json({
    success: true,
    message: `Employee ${
      req.body.is_active ? 'activated' : 'deactivated'
    }.`
  });
}

async function resetPassword(req, res) {
  const row = await employeeById(req.params.id);

  if (!row) {
    throw new AppError('Employee not found.', 404);
  }

  if (Number(row.user_id) === Number(req.user.id)) {
    throw new AppError(
      'You cannot reset your own password from employee management. Use the account password change feature.',
      400
    );
  }

  const temporaryPassword = generateTemporaryPassword();

  await pool.query(
    `UPDATE users
     SET password = $1,
         must_change_password = 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [
      await bcrypt.hash(temporaryPassword, 12),
      row.user_id
    ]
  );

  res.json({
    success: true,
    message: 'Password reset successfully.',
    employee: {
      id: row.id,
      employee_id: row.employee_id,
      name: `${row.first_name} ${row.last_name}`,
      email: row.email
    },
    temporaryPassword
  });
}

async function managers(req, res) {
  const result = await pool.query(
    `SELECT
       e.id,
       e.first_name,
       e.last_name,
       e.employee_id
     FROM employees e
     JOIN users u ON u.id = e.user_id
     WHERE u.role = 'manager'
       AND u.is_active = 1
     ORDER BY e.first_name`
  );

  res.json({
    success: true,
    data: result.rows
  });
}

async function adminStats(req, res) {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM employees)::integer AS "totalEmployees",
       (SELECT COUNT(*)
        FROM employees e
        JOIN users u ON u.id = e.user_id
        WHERE u.is_active = 1)::integer AS "activeEmployees",
       (SELECT COUNT(*)
        FROM employees e
        JOIN users u ON u.id = e.user_id
        WHERE u.is_active = 0)::integer AS "inactiveEmployees",
       (SELECT COUNT(*) FROM departments)::integer AS "totalDepartments"`
  );

  res.json({
    success: true,
    data: result.rows[0]
  });
}

module.exports = {
  departments,
  department,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  employees,
  employee,
  createEmployee,
  updateEmployee,
  status,
  resetPassword,
  managers,
  adminStats
};
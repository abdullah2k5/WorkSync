const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const pool = require('../config/database');

const REQUIRED_COLUMNS = ['employee_id', 'first_name', 'last_name', 'email', 'department', 'role', 'manager_email', 'job_title', 'status'];
const OPTIONAL_COLUMNS = ['phone', 'team'];
const VALID_ROLES = ['admin', 'manager', 'employee'];
const VALID_STATUSES = ['active', 'inactive'];

const normalize = (v) => (typeof v === 'string' ? v.trim() : '');
const normName = (v) => normalize(v).replace(/\s+/g, ' ');
const tempPassword = () => `Ws-${crypto.randomBytes(12).toString('base64url')}`;
const parseCsv = (c) => parse(c, { columns: true, skip_empty_lines: false, relax_column_count: false, bom: true, trim: true });

function emptySummary(totalRows = 0, invalidRows = 0) {
  return { totalRows, validRows: 0, invalidRows, duplicateRows: 0, warnings: 0 };
}

async function preview(content) {
  let records;
  try {
    records = parseCsv(content);
  } catch (error) {
    return {
      headers: [],
      rows: [],
      fileError: `Unable to parse CSV: ${error.message}`,
      departmentsDetected: [],
      departmentsToCreate: [],
      summary: emptySummary()
    };
  }

  const headers = records.length ? Object.keys(records[0]) : [];
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length) {
    return {
      headers,
      rows: [],
      fileError: `Missing required columns: ${missing.join(', ')}.`,
      departmentsDetected: [],
      departmentsToCreate: [],
      summary: emptySummary(records.length, records.length)
    };
  }

  const [emailsResult, idsResult, managersResult] = await Promise.all([
    pool.query('SELECT email FROM users'),
    pool.query('SELECT employee_id FROM employees'),
    pool.query("SELECT u.email FROM users u JOIN employees e ON e.user_id = u.id WHERE u.role = 'manager' AND u.is_active = 1")
  ]);

  const existingEmails = new Set(emailsResult.rows.map((r) => r.email.toLowerCase()));
  const existingIds = new Set(idsResult.rows.map((r) => r.employee_id.toLowerCase()));
  const activeManagers = new Set(managersResult.rows.map((r) => r.email.toLowerCase()));
  const fileEmails = new Set();
  const fileIds = new Set();
  const departmentNames = new Map();

  for (const raw of records) {
    const d = normName(raw.department);
    if (d) departmentNames.set(d.toLowerCase(), d);
  }

  const rows = records.map((raw, index) => {
    const data = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, normalize(v)]));
    data.department = normName(data.department);
    const errors = [];
    const warnings = [];
    const email = data.email.toLowerCase();
    const employeeId = data.employee_id.toLowerCase();
    const role = data.role.toLowerCase();

    if (!data.employee_id) errors.push('Employee ID is required.');
    if (!data.first_name) errors.push('First name is required.');
    if (!data.last_name) errors.push('Last name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Invalid email format.');
    if (!data.department) errors.push('Department is required.');
    if (!VALID_ROLES.includes(role)) errors.push('Role must be admin, manager, or employee.');
    if (!data.status || !VALID_STATUSES.includes(data.status.toLowerCase())) errors.push('Status must be active or inactive.');
    if (
      data.manager_email &&
      !activeManagers.has(data.manager_email.toLowerCase()) &&
      !records.some(
        (c) =>
          normalize(c.email).toLowerCase() === data.manager_email.toLowerCase() &&
          normalize(c.role).toLowerCase() === 'manager' &&
          normalize(c.status).toLowerCase() === 'active'
      )
    ) {
      errors.push('Manager email does not resolve to an active manager.');
    }
    if (data.email && data.manager_email && email === data.manager_email.toLowerCase()) {
      errors.push('An employee cannot be their own manager.');
    }
    if (fileEmails.has(email)) errors.push('Duplicate email in this file.');
    else if (existingEmails.has(email)) errors.push('Email already exists in the system.');
    if (fileIds.has(employeeId)) errors.push('Duplicate employee ID in this file.');
    else if (existingIds.has(employeeId)) errors.push('Employee ID already exists in the system.');

    fileEmails.add(email);
    fileIds.add(employeeId);

    return { rowNumber: index + 2, data, errors, warnings, status: errors.length ? 'Error' : 'Valid' };
  });

  const departmentsDetected = [...departmentNames.values()];
  const existingDepartments = new Set(
    (await pool.query('SELECT name FROM departments')).rows.map((r) => normName(r.name).toLowerCase())
  );

  const summary = {
    totalRows: rows.length,
    validRows: rows.filter((r) => r.status !== 'Error').length,
    invalidRows: rows.filter((r) => r.status === 'Error').length,
    duplicateRows: rows.filter((r) => r.errors.some((e) => e.includes('Duplicate') || e.includes('already exists'))).length,
    warnings: 0
  };

  return {
    headers,
    rows,
    departmentsDetected,
    departmentsToCreate: departmentsDetected.filter((n) => !existingDepartments.has(n.toLowerCase())),
    summary
  };
}

async function commit(content, adminUserId, filename) {
  const result = await preview(content);
  const valid = result.rows.filter((r) => r.status !== 'Error');
  if (result.fileError || result.summary.invalidRows || !valid.length) {
    return { ...result, imported: [], importId: null };
  }

  const imported = [];
  const staged = new Map();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const importResult = await client.query(
      'INSERT INTO employee_imports(admin_user_id,original_filename,total_rows,status) VALUES($1,$2,$3,$4) RETURNING id',
      [Number(adminUserId), filename, result.summary.totalRows, 'completed']
    );
    const importId = Number(importResult.rows[0].id);

    const departments = new Map(
      (await client.query('SELECT id,name FROM departments')).rows.map((r) => [normName(r.name).toLowerCase(), Number(r.id)])
    );

    for (const name of result.departmentsDetected) {
      if (!departments.has(name.toLowerCase())) {
        const created = await client.query(
          "INSERT INTO departments(name,description) VALUES($1,$2) RETURNING id",
          [name, 'Created during employee import.']
        );
        departments.set(name.toLowerCase(), Number(created.rows[0].id));
      }
    }

    for (const row of valid) {
      const password = tempPassword();

      const user = await client.query(
        'INSERT INTO users(email,password,role,is_active,must_change_password) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [
          row.data.email.toLowerCase(),
          bcrypt.hashSync(password, 12),
          row.data.role.toLowerCase(),
          row.data.status.toLowerCase() === 'active' ? 1 : 0,
          1
        ]
      );
      const userId = Number(user.rows[0].id);

      const employee = await client.query(
        'INSERT INTO employees(user_id,employee_id,first_name,last_name,phone,department_id,job_position,joining_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [
          userId,
          row.data.employee_id,
          row.data.first_name,
          row.data.last_name,
          row.data.phone || null,
          departments.get(row.data.department.toLowerCase()),
          row.data.job_title,
          row.data.joining_date || new Date().toISOString().slice(0, 10)
        ]
      );
      const employeeId = Number(employee.rows[0].id);

      staged.set(row.data.email.toLowerCase(), employeeId);
      imported.push({
        rowNumber: row.rowNumber,
        firstName: row.data.first_name,
        lastName: row.data.last_name,
        email: row.data.email,
        employeeId: row.data.employee_id,
        temporaryPassword: password
      });
    }

    for (const row of valid) {
      if (row.data.manager_email) {
        let managerId = staged.get(row.data.manager_email.toLowerCase());
        if (!managerId) {
          const manager = await client.query(
            "SELECT e.id FROM users u JOIN employees e ON e.user_id = u.id WHERE lower(u.email) = lower($1) AND u.role = 'manager' AND u.is_active = 1",
            [row.data.manager_email]
          );
          managerId = manager.rows[0]?.id;
        }
        if (!managerId) throw new Error(`Manager email could not be resolved: ${row.data.manager_email}`);
        await client.query('UPDATE employees SET manager_id=$1,updated_at=CURRENT_TIMESTAMP WHERE employee_id=$2', [
          Number(managerId),
          row.data.employee_id
        ]);
      }
    }

    await client.query('UPDATE employee_imports SET imported_rows=$1,failed_rows=$2,duplicate_rows=$3,status=$4 WHERE id=$5', [
      valid.length,
      result.summary.invalidRows,
      result.summary.duplicateRows,
      result.summary.invalidRows ? 'completed_with_errors' : 'completed',
      importId
    ]);

    await client.query('COMMIT');
    return { ...result, imported, importId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function resetDevelopmentData(adminUserId) {
  const files = (await pool.query('SELECT storage_path FROM task_attachments')).rows.map((r) => r.storage_path);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    for (const table of [
      'notification_preferences',
      'notifications',
      'employee_imports',
      'task_activity',
      'task_comments',
      'task_blockers',
      'task_attachments',
      'task_labels',
      'task_subtasks',
      'tasks',
      'leave_requests',
      'announcements'
    ]) {
      await client.query(`DELETE FROM ${table}`);
    }
    await client.query("UPDATE employees SET manager_id=NULL,department_id=NULL WHERE user_id IN (SELECT id FROM users WHERE role='admin')");
    await client.query("DELETE FROM employees WHERE user_id IN (SELECT id FROM users WHERE role!='admin')");
    await client.query("DELETE FROM users WHERE role!='admin'");
    await client.query('DELETE FROM labels');
    await client.query('DELETE FROM departments');
    await client.query("INSERT INTO departments(name,description) VALUES($1,$2)", ['General', 'Default development department.']);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  for (const file of files) {
    try {
      fs.unlinkSync(path.resolve(file));
    } catch {}
  }

  const admins = await pool.query("SELECT COUNT(*)::integer AS admins FROM users WHERE role='admin'");
  return admins.rows[0].admins;
}

module.exports = { REQUIRED_COLUMNS, OPTIONAL_COLUMNS, preview, commit, resetDevelopmentData };
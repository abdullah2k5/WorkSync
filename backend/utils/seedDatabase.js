const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { databasePath } = require('../config/env');

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = require('../config/database');
db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'manager', 'employee')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    job_position TEXT NOT NULL,
    joining_date TEXT NOT NULL,
    profile_picture TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
  CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
`);

const departments = [
  ['Human Resources', 'People operations and workplace support.'],
  ['Engineering', 'Software development and technical operations.'],
  ['Operations', 'Business operations and delivery.']
];
const addDepartment = db.prepare('INSERT OR IGNORE INTO departments (name, description) VALUES (?, ?)');
departments.forEach((department) => addDepartment.run(...department));

const accounts = [
  ['admin@worksync.com', 'Admin@123', 'admin', 'WS-001', 'Amina', 'Khan', 'Human Resources', 'System Administrator'],
  ['manager@worksync.com', 'Manager@123', 'manager', 'WS-002', 'Bilal', 'Ahmed', 'Engineering', 'Engineering Manager'],
  ['employee@worksync.com', 'Employee@123', 'employee', 'WS-003', 'Sara', 'Ali', 'Engineering', 'Software Developer']
];
const findUser = db.prepare('SELECT id FROM users WHERE email = ?');
const addUser = db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)');
const findDepartment = db.prepare('SELECT id FROM departments WHERE name = ?');
const addEmployee = db.prepare(`INSERT OR IGNORE INTO employees
  (user_id, employee_id, first_name, last_name, department_id, manager_id, job_position, joining_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

function seed() {
  db.exec('BEGIN');
  try {
  for (const [email, password, role, employeeId, firstName, lastName, department, position] of accounts) {
    let user = findUser.get(email);
    if (!user) {
      addUser.run(email, bcrypt.hashSync(password, 12), role);
      user = findUser.get(email);
    }
    const manager = role === 'employee' ? findUser.get('manager@worksync.com') : null;
    const managerEmployee = manager ? db.prepare('SELECT id FROM employees WHERE user_id = ?').get(manager.id) : null;
    addEmployee.run(user.id, employeeId, firstName, lastName, findDepartment.get(department).id, managerEmployee?.id || null, position, '2026-01-01');
  }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
seed();
console.log(`Database initialized at ${databasePath}`);

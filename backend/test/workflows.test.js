const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'worksync-test-'));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'worksync-test-secret';
process.env.DATABASE_PATH = path.join(testDirectory, 'worksync-test.sqlite');

const { DatabaseSync } = require('node:sqlite');
const bootstrapDb = new DatabaseSync(process.env.DATABASE_PATH);
bootstrapDb.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','employee')), is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE employees (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, employee_id TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL, department_id INTEGER REFERENCES departments(id), manager_id INTEGER REFERENCES employees(id), job_position TEXT NOT NULL, joining_date TEXT NOT NULL, profile_picture TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
bootstrapDb.close();

const app = require('../app');
const db = require('../config/database');
const { jwtSecret } = require('../config/env');
const { processDeadlineNotifications } = require('../utils/deadlineService');

const users = {};
const employees = {};

function createUser(key, email, role, employeeId, firstName, lastName, managerId = null) {
  const user = db.prepare('INSERT INTO users(email,password,role) VALUES(?,?,?)').run(email, bcrypt.hashSync(`${key}-password`, 4), role);
  const employee = db.prepare(`INSERT INTO employees(user_id,employee_id,first_name,last_name,department_id,manager_id,job_position,joining_date)
    VALUES(?,?,?,?,?,?,?,?)`).run(user.lastInsertRowid, employeeId, firstName, lastName, 1, managerId, `${role} tester`, '2026-01-01');
  users[key] = { id: Number(user.lastInsertRowid), email, role, password: `${key}-password` };
  employees[key] = { id: Number(employee.lastInsertRowid), userId: Number(user.lastInsertRowid) };
}

const department = db.prepare('INSERT INTO departments(name,description) VALUES(?,?)').run('Test Engineering', 'Automated test department');
createUser('admin', 'admin@test.local', 'admin', 'TEST-ADMIN', 'Ada', 'Admin');
createUser('manager', 'manager@test.local', 'manager', 'TEST-MANAGER', 'Mina', 'Manager');
createUser('employee', 'employee@test.local', 'employee', 'TEST-EMPLOYEE', 'Eli', 'Employee', employees.manager?.id || null);
// The employee was created after the manager, so its manager relationship is already valid.

db.prepare('UPDATE employees SET department_id=? WHERE id IN (?,?,?)').run(department.lastInsertRowid, employees.admin.id, employees.manager.id, employees.employee.id);

function token(key, overrides = {}) {
  const user = users[key];
  return jwt.sign({ id: user.id, email: user.email, role: user.role, ...overrides }, jwtSecret, { expiresIn: '1h' });
}
function auth(key) { return { Authorization: `Bearer ${token(key)}` }; }
function createTask(overrides = {}) {
  const values = { title: `Test task ${Date.now()}-${Math.random()}`, description: 'Test description', assigned_to: employees.employee.id, created_by: employees.manager.id, priority: 'Medium', status: 'To Do', progress: 0, due_date: '2099-12-31', ...overrides };
  return db.prepare('INSERT INTO tasks(title,description,assigned_to,created_by,priority,status,progress,due_date) VALUES(?,?,?,?,?,?,?,?)').run(values.title, values.description, values.assigned_to, values.created_by, values.priority, values.status, values.progress, values.due_date).lastInsertRowid;
}

process.on('exit', () => {
  try { db.close(); } catch {}
  try { fs.rmSync(testDirectory, { recursive: true, force: true }); } catch {}
});

describe('WorkSync API', () => {
  it('authenticates valid and invalid logins without revealing account existence', async () => {
    const valid = await request(app).post('/api/auth/login').send({ email: users.manager.email, password: users.manager.password });
    assert.equal(valid.status, 200);
    assert.ok(valid.body.token);
    assert.equal(valid.body.user.role, 'manager');
    const invalid = await request(app).post('/api/auth/login').send({ email: 'unknown@test.local', password: 'wrong' });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.message, 'Invalid email or password.');
    const missing = await request(app).post('/api/auth/login').send({ email: users.manager.email });
    assert.equal(missing.status, 400);
  });

  it('enforces authentication and role authorization', async () => {
    assert.equal((await request(app).get('/api/employees')).status, 401);
    assert.equal((await request(app).get('/api/employees').set(auth('employee'))).status, 403);
    assert.equal((await request(app).post('/api/tasks').set(auth('employee')).send({})).status, 403);
  });

  it('applies security headers, configured CORS, and deactivated-token protection', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:9000');
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:9000');
    assert.ok(allowed.headers['x-content-type-options']);
    db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(users.employee.id);
    assert.equal((await request(app).get('/api/profile').set(auth('employee'))).status, 401);
    db.prepare('UPDATE users SET is_active=1 WHERE id=?').run(users.employee.id);
  });

  it('creates, edits, and progresses an authorized task', async () => {
    const created = await request(app).post('/api/tasks').set(auth('manager')).send({ title: 'API task', description: 'Initial', assigned_to: employees.employee.id, priority: 'Low', due_date: '2099-12-31' });
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    const edited = await request(app).put(`/api/tasks/${id}`).set(auth('manager')).send({ title: 'Edited API task', description: 'Changed', assigned_to: employees.employee.id, priority: 'High', due_date: '2099-12-30' });
    assert.equal(edited.status, 200);
    const progressed = await request(app).patch(`/api/tasks/${id}/progress`).set(auth('employee')).send({ status: 'Completed', progress: 100 });
    assert.equal(progressed.status, 200);
    assert.equal(progressed.body.data.status, 'Completed');
    assert.equal(db.prepare('SELECT COUNT(*) count FROM task_activity WHERE task_id=?').get(id).count >= 4, true);
  });

  it('rejects manager assignment outside the manager team', async () => {
    createUser('outside', 'outside@test.local', 'employee', 'TEST-OUTSIDE', 'Other', 'Employee', null);
    const response = await request(app).post('/api/tasks').set(auth('manager')).send({ title: 'Unauthorized assignment', assigned_to: employees.outside.id, priority: 'Low', due_date: '2099-12-31' });
    assert.equal(response.status, 403);
  });

  it('supports labels and subtasks with authorization', async () => {
    const taskId = createTask();
    const label = await request(app).post('/api/labels').set(auth('manager')).send({ name: `Backend ${Date.now()}`, color: 'primary' });
    assert.equal(label.status, 201);
    assert.equal((await request(app).post(`/api/tasks/${taskId}/labels/${label.body.data.id}`).set(auth('manager'))).status, 200);
    assert.equal((await request(app).get(`/api/tasks/${taskId}/labels`).set(auth('employee'))).status, 200);
    const subtask = await request(app).post(`/api/tasks/${taskId}/subtasks`).set(auth('employee')).send({ title: 'Verify subtask' });
    assert.equal(subtask.status, 201);
    assert.equal((await request(app).patch(`/api/tasks/${taskId}/subtasks/${subtask.body.data.id}`).set(auth('employee')).send({ is_completed: true })).status, 200);
    assert.equal((await request(app).delete(`/api/tasks/${taskId}/subtasks/${subtask.body.data.id}`).set(auth('employee'))).status, 403);
  });

  it('handles leave submission and manager review', async () => {
    const created = await request(app).post('/api/leaves').set(auth('employee')).send({ leave_type: 'Annual Leave', start_date: '2099-01-10', end_date: '2099-01-11', reason: 'Test leave' });
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    const approved = await request(app).patch(`/api/leaves/${id}/review`).set(auth('manager')).send({ status: 'Approved' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.status, 'Approved');
  });

  it('creates collaboration notifications without notifying the actor', async () => {
    const taskId = createTask();
    const before = db.prepare('SELECT COUNT(*) count FROM notifications WHERE user_id=?').get(users.employee.id).count;
    assert.equal((await request(app).post(`/api/tasks/${taskId}/comments`).set(auth('employee')).send({ body: 'Test comment' })).status, 201);
    const after = db.prepare('SELECT COUNT(*) count FROM notifications WHERE user_id=?').get(users.employee.id).count;
    assert.equal(after, before);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM notifications WHERE user_id=? AND title='New task comment' AND related_entity_id=?").get(users.manager.id, taskId).count, 1);
  });

  it('uses enabled-by-default notification preferences and suppresses disabled categories', async () => {
    const defaults = await request(app).get('/api/profile/notification-preferences').set(auth('manager'));
    assert.equal(defaults.status, 200);
    assert.equal(defaults.body.data.task_comment, true);
    const updated = await request(app).patch('/api/profile/notification-preferences').set(auth('manager')).send({ task_comment: false });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.task_comment, false);
    const taskId = createTask();
    const before = db.prepare("SELECT COUNT(*) count FROM notifications WHERE user_id=? AND title='New task comment'").get(users.manager.id).count;
    assert.equal((await request(app).post(`/api/tasks/${taskId}/comments`).set(auth('employee')).send({ body: 'Preference test' })).status, 201);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM notifications WHERE user_id=? AND title='New task comment'").get(users.manager.id).count, before);
    const invalid = await request(app).patch('/api/profile/notification-preferences').set(auth('manager')).send({ unknown_category: false });
    assert.equal(invalid.status, 400);
    const reset = await request(app).post('/api/profile/notification-preferences/reset').set(auth('manager'));
    assert.equal(reset.status, 200);
    assert.equal(reset.body.data.task_comment, true);
  });

  it('enforces collaboration authorization and attachment validation', async () => {
    const taskId = createTask();
    const blocker = await request(app).post(`/api/tasks/${taskId}/blockers`).set(auth('employee')).send({ description: 'Test blocker' });
    assert.equal(blocker.status, 201);
    assert.equal((await request(app).patch(`/api/tasks/${taskId}/blockers/${blocker.body.data.id}`).set(auth('admin')).send({ status: 'RESOLVED' })).status, 200);
    const upload = await request(app).post(`/api/tasks/${taskId}/attachments`).set(auth('employee')).attach('file', Buffer.from('test'), { filename: 'test.exe', contentType: 'application/x-msdownload' });
    assert.equal(upload.status, 400);
    assert.equal((await request(app).get(`/api/tasks/${taskId}/attachments`).set(auth('admin'))).status, 200);
  });

  it('protects profile access and exposes dashboard deadline data', async () => {
    assert.equal((await request(app).get('/api/profile').set(auth('employee'))).status, 200);
    assert.equal((await request(app).get('/api/tasks/999999/activity').set(auth('employee'))).status, 404);
    const dashboard = await request(app).get('/api/dashboard/employee').set(auth('employee'));
    assert.equal(dashboard.status, 200);
    assert.equal(typeof dashboard.body.data.dueToday, 'number');
    assert.equal(typeof dashboard.body.data.dueThisWeek, 'number');
  });

  it('scopes reports and applies department filters consistently', async () => {
    const adminSummary = await request(app).get('/api/reports/summary').set(auth('admin'));
    assert.equal(adminSummary.status, 200);
    const managerSummary = await request(app).get('/api/reports/summary').set(auth('manager'));
    assert.equal(managerSummary.status, 200);
    assert.equal((await request(app).get('/api/reports/summary').set(auth('employee'))).status, 403);
    const charts = await request(app).get(`/api/reports/charts?department_id=${department.lastInsertRowid}`).set(auth('admin'));
    assert.equal(charts.status, 200);
    assert.equal(charts.body.data.employeesByDept.every((row) => row.department_name === 'Test Engineering'), true);
  });

  it('supports authorized attachment lifecycle operations', async () => {
    const taskId = createTask();
    const upload = await request(app).post(`/api/tasks/${taskId}/attachments`).set(auth('employee')).attach('file', Buffer.from('valid test file'), { filename: 'test.txt', contentType: 'text/plain' });
    assert.equal(upload.status, 201);
    const attachmentId = upload.body.data.id;
    assert.equal((await request(app).get(`/api/tasks/${taskId}/attachments/${attachmentId}`).set(auth('manager'))).status, 200);
    assert.equal((await request(app).delete(`/api/tasks/${taskId}/attachments/${attachmentId}`).set(auth('manager'))).status, 200);
  });

  it('classifies deadlines and deduplicates repeated reminders', () => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const taskId = createTask({ due_date: date });
    processDeadlineNotifications();
    processDeadlineNotifications();
    assert.equal(db.prepare("SELECT COUNT(*) count FROM notifications WHERE user_id=? AND title='Upcoming task deadline' AND related_entity_id=?").get(users.employee.id, taskId).count, 1);
    db.prepare('UPDATE tasks SET status=? WHERE id=?').run('Completed', taskId);
  });

  it('changes passwords securely and preserves login behavior', async () => {
    const oldPassword = users.employee.password;
    const newPassword = 'new-password-for-test';
    const verify = await request(app).post('/api/profile/password/verify').set(auth('employee')).send({ current_password: oldPassword });
    assert.equal(verify.status, 200);
    const update = await request(app).put('/api/profile/password').set(auth('employee')).send({ verification_token: verify.body.verification_token, new_password: newPassword, confirm_password: newPassword });
    assert.equal(update.status, 200);
    assert.equal((await request(app).post('/api/auth/login').send({ email: users.employee.email, password: newPassword })).status, 200);
    assert.equal((await request(app).post('/api/auth/login').send({ email: users.employee.email, password: oldPassword })).status, 401);
  });

  it('previews and atomically imports valid CSV employees as an Admin', async () => {
    const stamp = Date.now();
    const csv = `employee_id,first_name,last_name,email,phone,department,team,role,manager_email,job_title,status\nIMP-${stamp},Import,Manager,import.manager.${stamp}@test.local,03000000000,Test Engineering,,manager,,Team Manager,active\nIMP-${stamp + 1},Import,Employee,import.employee.${stamp}@test.local,03000000001,Test Engineering,,employee,import.manager.${stamp}@test.local,Team Member,active`;
    const preview = await request(app).post('/api/employee-imports/preview').set(auth('admin')).attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.summary.validRows, 2);
    const committed = await request(app).post('/api/employee-imports/commit').set(auth('admin')).attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });
    assert.equal(committed.status, 201);
    assert.equal(committed.body.data.imported.length, 2);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM users WHERE email LIKE ?').get(`import.%${stamp}@test.local`).count, 2);
    const importedUser = db.prepare('SELECT id,email,must_change_password FROM users WHERE email=?').get(`import.employee.${stamp}@test.local`);
    assert.equal(importedUser.must_change_password, 1);
    const importedToken = jwt.sign({ id: importedUser.id, email: importedUser.email, role: 'employee' }, jwtSecret, { expiresIn: '1h' });
    assert.equal((await request(app).get('/api/tasks').set({ Authorization: `Bearer ${importedToken}` })).status, 403);
    const importedCredential = committed.body.data.imported.find((item) => item.email === importedUser.email).temporaryPassword;
    const changed = await request(app).post('/api/auth/change-password').set({ Authorization: `Bearer ${importedToken}` }).send({ currentPassword: importedCredential, newPassword: 'ImportedNew!123', confirmPassword: 'ImportedNew!123' });
    assert.equal(changed.status, 200);
    assert.equal(db.prepare('SELECT must_change_password FROM users WHERE id=?').get(importedUser.id).must_change_password, 0);
    assert.equal((await request(app).get('/api/employee-imports').set(auth('admin'))).status, 200);
  });

  it('rejects employee import for non-admins and invalid CSV without writes', async () => {
    const csv = 'employee_id,first_name\nBAD-1,Bad';
    assert.equal((await request(app).post('/api/employee-imports/preview').set(auth('manager')).attach('file', Buffer.from(csv), 'bad.csv')).status, 403);
    const before = db.prepare('SELECT COUNT(*) count FROM users').get().count;
    const invalid = await request(app).post('/api/employee-imports/commit').set(auth('admin')).attach('file', Buffer.from(csv), 'bad.csv');
    assert.equal(invalid.status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM users').get().count, before);
  });

  it('resets employee passwords securely and requires a forced password change', async () => {
    const oldPassword = 'ResetOld!123';
    db.prepare('UPDATE users SET password=?,must_change_password=0 WHERE id=?').run(bcrypt.hashSync(oldPassword, 4), users.employee.id);
    assert.equal((await request(app).post(`/api/employees/${employees.employee.id}/reset-password`)).status, 401);
    assert.equal((await request(app).post(`/api/employees/${employees.employee.id}/reset-password`).set(auth('manager'))).status, 403);
    assert.equal((await request(app).post(`/api/employees/${employees.employee.id}/reset-password`).set(auth('employee'))).status, 403);
    assert.equal((await request(app).post('/api/employees/999999/reset-password').set(auth('admin'))).status, 404);
    assert.equal((await request(app).post(`/api/employees/${employees.admin.id}/reset-password`).set(auth('admin'))).status, 400);

    const reset = await request(app).post(`/api/employees/${employees.employee.id}/reset-password`).set(auth('admin'));
    assert.equal(reset.status, 200);
    assert.equal(reset.body.message, 'Password reset successfully.');
    assert.equal(reset.body.employee.id, employees.employee.id);
    const temporaryPassword = reset.body.temporaryPassword;
    assert.match(temporaryPassword, /[a-z]/);
    assert.match(temporaryPassword, /[A-Z]/);
    assert.match(temporaryPassword, /[0-9]/);
    assert.match(temporaryPassword, /[!@#$%^&*_+=-]/);
    assert.equal(temporaryPassword.length >= 12, true);

    const stored = db.prepare('SELECT password,must_change_password FROM users WHERE id=?').get(users.employee.id);
    assert.equal(stored.must_change_password, 1);
    assert.notEqual(stored.password, temporaryPassword);
    assert.equal(stored.password.includes(temporaryPassword), false);
    assert.equal(bcrypt.compareSync(temporaryPassword, stored.password), true);
    assert.equal((await request(app).post('/api/auth/login').send({ email: users.employee.email, password: oldPassword })).status, 401);

    const temporaryLogin = await request(app).post('/api/auth/login').send({ email: users.employee.email, password: temporaryPassword });
    assert.equal(temporaryLogin.status, 200);
    assert.equal(temporaryLogin.body.user.must_change_password, true);
    assert.equal((await request(app).get('/api/tasks').set({ Authorization: `Bearer ${temporaryLogin.body.token}` })).status, 403);

    const permanentPassword = 'ResetPermanent!456';
    const changed = await request(app).post('/api/auth/change-password').set({ Authorization: `Bearer ${temporaryLogin.body.token}` }).send({ currentPassword: temporaryPassword, newPassword: permanentPassword, confirmPassword: permanentPassword });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.user.must_change_password, false);
    assert.equal(db.prepare('SELECT must_change_password FROM users WHERE id=?').get(users.employee.id).must_change_password, 0);
    assert.equal((await request(app).post('/api/auth/login').send({ email: users.employee.email, password: permanentPassword })).status, 200);
  });

  it('rate-limits repeated login attempts with a generic response', async () => {
    let last;
    for (let index = 0; index < 21; index += 1) last = await request(app).post('/api/auth/login').send({ email: 'rate-limit@test.local', password: 'wrong' });
    assert.equal(last.status, 429);
    assert.match(last.body.message, /Too many login attempts/i);
  });
});

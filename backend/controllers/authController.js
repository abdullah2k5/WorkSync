const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { findByEmail, findById, findEmployeeByUserId } = require('../models/userModel');
const db = require('../config/database');
const AppError = require('../utils/AppError');
const loginFailures = new Map();
const failureWindowMs = Number(process.env.LOGIN_FAILURE_WINDOW_MS) || 15 * 60 * 1000;
const failureLimit = Number(process.env.LOGIN_FAILURE_LIMIT) || 5;

function loginKey(req, email) { return `${req.ip || 'unknown'}:${email}`; }

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, must_change_password: Boolean(user.must_change_password) };
}

function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    throw new AppError('Email and password are required.', 400);
  }
  const normalizedEmail = email.trim().toLowerCase();
  const key = loginKey(req, normalizedEmail);
  const current = loginFailures.get(key);
  if (current && Date.now() - current.firstAttempt < failureWindowMs && current.count >= failureLimit) {
    throw new AppError('Invalid email or password.', 401);
  }
  if (current && Date.now() - current.firstAttempt >= failureWindowMs) loginFailures.delete(key);

  const user = findByEmail(normalizedEmail);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    const failure = loginFailures.get(key) || { count: 0, firstAttempt: Date.now() };
    failure.count += 1;
    loginFailures.set(key, failure);
    throw new AppError('Invalid email or password.', 401);
  }
  loginFailures.delete(key);
  if (!user.is_active) throw new AppError('This account has been deactivated.', 403);

  const token = jwt.sign(publicUser(user), jwtSecret, { expiresIn: '8h' });
  res.json({ success: true, message: 'Login successful', token, user: publicUser(user) });
}

function me(req, res) {
  const user = findById(req.user.id);
  if (!user || !user.is_active) throw new AppError('User account is unavailable.', 401);
  res.json({ success: true, user: publicUser(user), employee: findEmployeeByUserId(user.id) || null });
}

function changePassword(req, res) {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  const user = findById(req.user.id);
  const fullUser = db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id);
  if (!user || !fullUser || typeof currentPassword !== 'string' || !bcrypt.compareSync(currentPassword, fullUser.password)) throw new AppError('Current password is incorrect.', 400);
  if (typeof newPassword !== 'string' || newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) throw new AppError('Password must be at least 8 characters and include uppercase, lowercase, and a number.', 400);
  if (newPassword !== confirmPassword) throw new AppError('New passwords do not match.', 400);
  if (bcrypt.compareSync(newPassword, fullUser.password)) throw new AppError('New password must be different from the current password.', 400);
  db.prepare('UPDATE users SET password=?,must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(bcrypt.hashSync(newPassword, 12), req.user.id);
  const updated = findById(req.user.id);
  const token = jwt.sign(publicUser(updated), jwtSecret, { expiresIn: '8h' });
  res.json({ success: true, message: 'Password changed successfully.', token, user: publicUser(updated) });
}

module.exports = { login, me, changePassword };

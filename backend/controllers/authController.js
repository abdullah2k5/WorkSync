const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../config/env');
const pool = require('../config/postgres');

const {
  findByEmail,
  findById,
  findEmployeeByUserId
} = require('../models/userModel');

const AppError = require('../utils/AppError');

const loginFailures = new Map();

const failureWindowMs =
  Number(process.env.LOGIN_FAILURE_WINDOW_MS) || 15 * 60 * 1000;

const failureLimit =
  Number(process.env.LOGIN_FAILURE_LIMIT) || 5;

function loginKey(req, email) {
  return `${req.ip || 'unknown'}:${email}`;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    must_change_password: Boolean(user.must_change_password)
  };
}

async function login(req, res) {
  const { email, password } = req.body || {};

  if (
    typeof email !== 'string' ||
    !email.trim() ||
    typeof password !== 'string' ||
    !password
  ) {
    throw new AppError('Email and password are required.', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const key = loginKey(req, normalizedEmail);

  const current = loginFailures.get(key);

  if (
    current &&
    Date.now() - current.firstAttempt < failureWindowMs &&
    current.count >= failureLimit
  ) {
    throw new AppError('Invalid email or password.', 401);
  }

  if (
    current &&
    Date.now() - current.firstAttempt >= failureWindowMs
  ) {
    loginFailures.delete(key);
  }

  const user = await findByEmail(normalizedEmail);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    const failure =
      loginFailures.get(key) || {
        count: 0,
        firstAttempt: Date.now()
      };

    failure.count += 1;
    loginFailures.set(key, failure);

    throw new AppError('Invalid email or password.', 401);
  }

  loginFailures.delete(key);

  if (!user.is_active) {
    throw new AppError('This account has been deactivated.', 403);
  }

  const token = jwt.sign(
    publicUser(user),
    jwtSecret,
    { expiresIn: '8h' }
  );

  res.json({
    success: true,
    message: 'Login successful',
    token,
    user: publicUser(user)
  });
}

async function me(req, res) {
  const user = await findById(req.user.id);

  if (!user || !user.is_active) {
    throw new AppError('User account is unavailable.', 401);
  }

  const employee = await findEmployeeByUserId(user.id);

  res.json({
    success: true,
    user: publicUser(user),
    employee: employee || null
  });
}

async function changePassword(req, res) {
  const {
    currentPassword,
    newPassword,
    confirmPassword
  } = req.body || {};

  const user = await findById(req.user.id);

  const passwordResult = await pool.query(
    'SELECT password FROM users WHERE id = $1',
    [req.user.id]
  );

  const fullUser = passwordResult.rows[0];

  if (
    !user ||
    !fullUser ||
    typeof currentPassword !== 'string' ||
    !(await bcrypt.compare(currentPassword, fullUser.password))
  ) {
    throw new AppError('Current password is incorrect.', 400);
  }

  if (
    typeof newPassword !== 'string' ||
    newPassword.length < 8 ||
    !/[A-Z]/.test(newPassword) ||
    !/[a-z]/.test(newPassword) ||
    !/[0-9]/.test(newPassword)
  ) {
    throw new AppError(
      'Password must be at least 8 characters and include uppercase, lowercase, and a number.',
      400
    );
  }

  if (newPassword !== confirmPassword) {
    throw new AppError('New passwords do not match.', 400);
  }

  if (await bcrypt.compare(newPassword, fullUser.password)) {
    throw new AppError(
      'New password must be different from the current password.',
      400
    );
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  await pool.query(
    `UPDATE users
     SET password = $1,
         must_change_password = 0,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [newPasswordHash, req.user.id]
  );

  const updated = await findById(req.user.id);

  const token = jwt.sign(
    publicUser(updated),
    jwtSecret,
    { expiresIn: '8h' }
  );

  res.json({
    success: true,
    message: 'Password changed successfully.',
    token,
    user: publicUser(updated)
  });
}

module.exports = {
  login,
  me,
  changePassword
};
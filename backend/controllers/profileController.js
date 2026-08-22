const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const AppError = require('../utils/AppError');
const { jwtSecret } = require('../config/env');

async function profileByUserId(userId) {
  const result = await pool.query(
    `
    SELECT u.id AS user_id, u.email, u.role, u.is_active,
      e.id, e.employee_id, e.first_name, e.last_name, e.phone,
      e.job_position, e.joining_date, e.profile_picture,
      d.id AS department_id, d.name AS department_name,
      manager.id AS manager_id,
      manager.first_name || ' ' || manager.last_name AS manager_name
    FROM users u
    LEFT JOIN employees e ON e.user_id = u.id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN employees manager ON manager.id = e.manager_id
    WHERE u.id = $1
  `,
    [userId]
  );
  return result.rows[0];
}

async function responseData(userId) {
  const row = await profileByUserId(userId);
  if (!row) throw new AppError('User account is unavailable.', 404);
  const { user_id, id, ...employee } = row;
  return {
    user: { id: user_id, email: row.email, role: row.role },
    employee: id ? { id, ...employee } : null,
  };
}

async function profile(req, res) {
  res.json({ success: true, data: await responseData(req.user.id) });
}

function validateAvatar(value) {
  if (value == null || value === '') return;
  if (typeof value !== 'string' || value.length > 2 * 1024 * 1024 || !/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    throw new AppError('Profile picture must be a PNG, JPEG, or WebP image under 2 MB.', 400);
  }
}

async function update(req, res) {
  const current = await profileByUserId(req.user.id);
  if (!current?.id) throw new AppError('Employee profile not found.', 404);
  const body = req.body || {};
  const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : current.first_name;
  const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : current.last_name;
  const phone = body.phone == null ? null : String(body.phone).trim();
  if (!firstName || !lastName) throw new AppError('First name and last name are required.', 400);
  if (phone && !/^[0-9+()\-\s]{7,24}$/.test(phone)) throw new AppError('Enter a valid phone number.', 400);
  validateAvatar(body.profile_picture);

  const picture = body.profile_picture === undefined ? current.profile_picture : (body.profile_picture || null);
  await pool.query(
    `UPDATE employees
     SET first_name=$1, last_name=$2, phone=$3, profile_picture=$4, updated_at=CURRENT_TIMESTAMP
     WHERE id=$5`,
    [firstName, lastName, phone || null, picture, current.id]
  );
  res.json({ success: true, data: await responseData(req.user.id) });
}

async function verifyPassword(req, res) {
  const { current_password } = req.body || {};
  const found = await pool.query('SELECT password FROM users WHERE id=$1', [req.user.id]);
  const user = found.rows[0];
  if (!user || typeof current_password !== 'string' || !bcrypt.compareSync(current_password, user.password)) {
    throw new AppError('Incorrect current password. Please try again.', 400);
  }
  const verificationToken = jwt.sign({ sub: req.user.id, purpose: 'password-change' }, jwtSecret, { expiresIn: '5m' });
  res.json({ success: true, verification_token: verificationToken });
}

async function changePassword(req, res) {
  const { verification_token, new_password, confirm_password } = req.body || {};
  let verification;
  try {
    verification = jwt.verify(verification_token, jwtSecret);
  } catch {
    throw new AppError('Password verification has expired. Please start again.', 401);
  }
  if (verification.purpose !== 'password-change' || Number(verification.sub) !== Number(req.user.id)) {
    throw new AppError('Invalid password verification.', 401);
  }
  const found = await pool.query('SELECT password FROM users WHERE id=$1', [req.user.id]);
  const user = found.rows[0];
  if (!user) throw new AppError('User account is unavailable.', 401);
  if (typeof new_password !== 'string' || new_password.length < 8) {
    throw new AppError('New password must be at least 8 characters.', 400);
  }
  if (new_password !== confirm_password) throw new AppError('New passwords do not match.', 400);
  if (bcrypt.compareSync(new_password, user.password)) throw new AppError('New password must be different from the current password.', 400);
  await pool.query('UPDATE users SET password=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [
    bcrypt.hashSync(new_password, 12),
    req.user.id
  ]);
  res.json({ success: true, message: 'Password changed successfully.' });
}

module.exports = { profile, update, verifyPassword, changePassword };
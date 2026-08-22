const jwt = require('jsonwebtoken');

const { jwtSecret } = require('../config/env');
const pool = require('../config/postgres');
const AppError = require('../utils/AppError');

async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(
      new AppError('Authentication token is required.', 401)
    );
  }

  try {
    req.user = jwt.verify(token, jwtSecret);

    const result = await pool.query(
      `SELECT
        id,
        role,
        is_active,
        must_change_password
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    const currentUser = result.rows[0];

    if (!currentUser || !currentUser.is_active) {
      return next(
        new AppError('User account is unavailable.', 401)
      );
    }

    req.user.role = currentUser.role;
    req.user.must_change_password =
      Boolean(currentUser.must_change_password);

    if (
      req.user.must_change_password &&
      ![
        '/api/auth/change-password',
        '/api/auth/me'
      ].includes(req.originalUrl)
    ) {
      return next(
        new AppError(
          'Password change required before accessing WorkSync.',
          403
        )
      );
    }

    return next();
  } catch {
    return next(
      new AppError(
        'Invalid or expired authentication token.',
        401
      )
    );
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          'You are not authorized to access this resource.',
          403
        )
      );
    }

    return next();
  };
}

module.exports = {
  authenticate,
  authorize
};
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be configured in production.');
}

if (
  process.env.NODE_ENV === 'production' &&
  process.env.JWT_SECRET === 'development-only-secret-change-me'
) {
  throw new Error('A secure JWT_SECRET must be configured in production.');
}

module.exports = {
  port: Number(process.env.PORT) || 3000,

  jwtSecret:
    process.env.JWT_SECRET ||
    'development-only-secret-change-me',

  frontendOrigins:
    (process.env.FRONTEND_URL || 'http://localhost:9000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),

  // Legacy SQLite path. No longer used by live application code; retained
  // because the SQLite-based test suite (backend/test/workflows.test.js)
  // sets DATABASE_PATH, and routes/utils/seedDatabase.js references it.
  // Safe to remove once those are migrated or retired.
  databasePath:
    process.env.DATABASE_PATH ||
    path.join(
      process.env.APPDATA || process.cwd(),
      'WorkSync',
      'database',
      'worksync.sqlite'
    ),

  // PostgreSQL configuration
  postgres: {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD
  }
};
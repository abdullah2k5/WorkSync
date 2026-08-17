const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be configured in production.');
}
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === 'development-only-secret-change-me') {
  throw new Error('A secure JWT_SECRET must be configured in production.');
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret-change-me',
  frontendOrigins: (process.env.FRONTEND_URL || 'http://localhost:9000').split(',').map((origin) => origin.trim()).filter(Boolean),
  databasePath: process.env.DATABASE_PATH || path.resolve(__dirname, '../../database/worksync_db.sqlite')
};

const { Pool } = require('pg');
const { postgres } = require('./env');

const pool = new Pool({
  host: postgres.host,
  port: postgres.port,
  database: postgres.database,
  user: postgres.user,
  password: postgres.password,
});

pool.on('error', (error) => {
  console.error('[POSTGRES] Unexpected pool error:', error);
});

console.log('========================================');
console.log('[POSTGRES] Configuration loaded');
console.log('[POSTGRES] Host:', postgres.host);
console.log('[POSTGRES] Port:', postgres.port);
console.log('[POSTGRES] Database:', postgres.database);
console.log('[POSTGRES] User:', postgres.user);
console.log('========================================');

module.exports = pool;
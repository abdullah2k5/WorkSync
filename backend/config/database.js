const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Load the project root .env file
dotenv.config({
  path: path.join(__dirname, '..', '..', '.env'),
});

console.log('========================================');
console.log('[DATABASE] Connecting to PostgreSQL');
console.log('[DATABASE] Host:', process.env.PGHOST || 'localhost');
console.log('[DATABASE] Port:', process.env.PGPORT || 5432);
console.log('[DATABASE] Database:', process.env.PGDATABASE || 'worksync');
console.log('[DATABASE] User:', process.env.PGUSER || 'postgres');
console.log('========================================');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'worksync',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
});

pool.on('error', (error) => {
  console.error('[DATABASE] Unexpected PostgreSQL pool error:', error);
});

async function testConnection() {
  try {
    const result = await pool.query(
      'SELECT current_database() AS database, current_user AS user'
    );

    console.log('[DATABASE] PostgreSQL connected successfully');
    console.log('[DATABASE] Database:', result.rows[0].database);
    console.log('[DATABASE] User:', result.rows[0].user);
  } catch (error) {
    console.error('[DATABASE] PostgreSQL connection failed:', error.message);
    throw error;
  }
}

module.exports = pool;
module.exports.testConnection = testConnection;
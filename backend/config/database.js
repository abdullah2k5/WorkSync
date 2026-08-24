const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Load the project root .env file.
// On Koyeb, environment variables are injected directly,
// so this does not interfere with cloud configuration.
dotenv.config({
  path: path.join(__dirname, '..', '..', '.env'),
});

const isProduction = process.env.NODE_ENV === 'production';
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

let poolConfig;

if (hasDatabaseUrl) {
  // Cloud / DATABASE_URL configuration
  poolConfig = {
    connectionString: process.env.DATABASE_URL,

    // Cloud PostgreSQL providers such as Supabase
    // commonly require SSL.
    ...(isProduction && {
      ssl: {
        rejectUnauthorized: false,
      },
    }),
  };

  console.log('========================================');
  console.log('[DATABASE] Configuration: DATABASE_URL');
  console.log('[DATABASE] Environment:', process.env.NODE_ENV || 'development');
  console.log('========================================');
} else {
  // Local PostgreSQL configuration
  poolConfig = {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'worksync',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
  };

  console.log('========================================');
  console.log('[DATABASE] Configuration: local PostgreSQL');
  console.log('[DATABASE] Host:', poolConfig.host);
  console.log('[DATABASE] Port:', poolConfig.port);
  console.log('[DATABASE] Database:', poolConfig.database);
  console.log('[DATABASE] User:', poolConfig.user);
  console.log('========================================');
}

const pool = new Pool(poolConfig);

pool.on('error', (error) => {
  console.error(
    '[DATABASE] Unexpected PostgreSQL pool error:',
    error
  );
});

async function testConnection() {
  try {
    const result = await pool.query(
      'SELECT current_database() AS database, current_user AS user'
    );

    console.log('[DATABASE] PostgreSQL connected successfully');
    console.log('[DATABASE] Database:', result.rows[0].database);
    console.log('[DATABASE] User:', result.rows[0].user);

    return result.rows[0];
  } catch (error) {
    console.error(
      '[DATABASE] PostgreSQL connection failed:',
      error.message
    );

    throw error;
  }
}

module.exports = pool;
module.exports.testConnection = testConnection;
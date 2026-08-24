/**
 * Backward-compatible re-export.
 *
 * config/database.js is now the single canonical PostgreSQL connection
 * layer (local PG* variables or cloud DATABASE_URL, with production SSL).
 * This file intentionally does NOT create its own Pool so that the
 * application always uses exactly one shared pg.Pool instance.
 *
 * New code should require('./config/database') directly.
 */
const database = require('./database');

module.exports = database;
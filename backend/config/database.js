const { DatabaseSync } = require('node:sqlite');
const { databasePath } = require('./env');

const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

module.exports = db;

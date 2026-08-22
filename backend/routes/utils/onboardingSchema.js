const db = require('../config/database');

const columns = db.prepare('PRAGMA table_info(users)').all();
if (columns.length && !columns.some((column) => column.name === 'must_change_password')) {
  db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1))');
}

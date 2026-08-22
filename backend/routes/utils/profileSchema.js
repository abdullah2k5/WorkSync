const db = require('../config/database');

const columns = db.prepare('PRAGMA table_info(employees)').all();
if (columns.length && !columns.some((column) => column.name === 'phone')) {
  db.exec('ALTER TABLE employees ADD COLUMN phone TEXT');
}

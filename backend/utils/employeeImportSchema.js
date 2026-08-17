const db = require('../config/database');

db.exec(`
  CREATE TABLE IF NOT EXISTS employee_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    original_filename TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('completed','completed_with_errors','failed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_employee_imports_admin_time ON employee_imports(admin_user_id, created_at DESC);
`);

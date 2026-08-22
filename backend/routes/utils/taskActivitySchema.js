const db = require('../config/database');

db.exec(`
  CREATE TABLE IF NOT EXISTS task_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    activity_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_task_activity_task_time ON task_activity(task_id, created_at, id);
  CREATE INDEX IF NOT EXISTS idx_task_activity_actor ON task_activity(actor_user_id);
`);

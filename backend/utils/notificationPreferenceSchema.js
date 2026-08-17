const db = require('../config/database');

const categories = [
  'task_assignment',
  'task_comment',
  'blocker_created',
  'blocker_resolved',
  'attachment',
  'due_date_reminder',
  'overdue_task',
  'leave_update',
  'announcement',
];

db.exec(`
  CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, category)
  );
  CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);
`);

module.exports = { categories };

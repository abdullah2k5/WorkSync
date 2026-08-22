const db=require('../config/database');
db.exec(`CREATE TABLE IF NOT EXISTS notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 type TEXT NOT NULL CHECK(type IN ('task','leave','announcement','system')) DEFAULT 'system',
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 related_entity_type TEXT,
 related_entity_id INTEGER,
 is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
); CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id); CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id,is_read); CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(related_entity_type,related_entity_id);`);
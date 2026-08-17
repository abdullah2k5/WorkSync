const db=require('../config/database');
db.exec(`CREATE TABLE IF NOT EXISTS announcements (
 id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,message TEXT NOT NULL,
 priority TEXT NOT NULL CHECK(priority IN ('normal','important','urgent')) DEFAULT 'normal',
 target_audience TEXT NOT NULL CHECK(target_audience IN ('all','managers','employees')) DEFAULT 'all',
 created_by INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
); CREATE INDEX IF NOT EXISTS idx_announcements_priority ON announcements(priority); CREATE INDEX IF NOT EXISTS idx_announcements_audience ON announcements(target_audience); CREATE INDEX IF NOT EXISTS idx_announcements_creator ON announcements(created_by);`);
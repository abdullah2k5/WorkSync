const db=require('../config/database');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,description TEXT,assigned_to INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,created_by INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 priority TEXT NOT NULL CHECK(priority IN ('Low','Medium','High')) DEFAULT 'Medium',status TEXT NOT NULL CHECK(status IN ('To Do','In Progress','Completed')) DEFAULT 'To Do',progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),due_date TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
); CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigned_to); CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(created_by); CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`);

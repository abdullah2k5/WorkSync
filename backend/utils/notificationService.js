const db=require('../config/database');
const { emitNotification } = require('./notificationStream');
const categoryFor = (type, title) => {
  if (type === 'leave') return 'leave_update';
  if (type === 'announcement') return 'announcement';
  if (title.startsWith('Task assigned by ') || title === 'Task assigned to you' || title === 'Task assignment changed') return 'task_assignment';
  if (title === 'New task comment') return 'task_comment';
  if (title === 'Blocker reported') return 'blocker_created';
  if (title === 'Blocker resolved') return 'blocker_resolved';
  if (title === 'Task attachment uploaded') return 'attachment';
  if (title === 'Upcoming task deadline' || title === 'Task due today') return 'due_date_reminder';
  if (title === 'Task overdue') return 'overdue_task';
  return null;
};
function notifyUser(userId,type,title,message,entityType,entityId,allowDuplicateEvents=false){
  if(!userId)return;
  const category = categoryFor(type, title);
  if (category) {
    const preference = db.prepare('SELECT enabled FROM notification_preferences WHERE user_id=? AND category=?').get(userId, category);
    if (preference && !preference.enabled) return;
  }
  const exists=db.prepare('SELECT id FROM notifications WHERE user_id=? AND type=? AND related_entity_type=? AND related_entity_id=? AND title=? AND message=?').get(userId,type,entityType,entityId,title,message);
  if(exists&&!allowDuplicateEvents)return;
  const row=db.prepare('INSERT INTO notifications(user_id,type,title,message,related_entity_type,related_entity_id) VALUES(?,?,?,?,?,?)').run(userId,type,title,message,entityType,entityId);
  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(row.lastInsertRowid);
  emitNotification(userId, notification);
}
function notifyEmployee(employeeId,type,title,message,entityType,entityId){
  const row=db.prepare('SELECT user_id FROM employees WHERE id=?').get(employeeId);
  if(row)notifyUser(row.user_id,type,title,message,entityType,entityId);
}
function notifyRole(role,type,title,message,entityType,entityId){
  const users=db.prepare('SELECT id FROM users WHERE role=? AND is_active=1').all(role);
  users.forEach(u=>notifyUser(u.id,type,title,message,entityType,entityId));
}
function notifyManagerOf(employeeId,type,title,message,entityType,entityId){
  const e=db.prepare('SELECT manager_id FROM employees WHERE id=?').get(employeeId);
  if(e&&e.manager_id)notifyEmployee(e.manager_id,type,title,message,entityType,entityId);
}
module.exports={notifyUser,notifyEmployee,notifyRole,notifyManagerOf};
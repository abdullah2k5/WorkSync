import { createRouter, createWebHistory } from 'vue-router';
import LoginPage from '../pages/LoginPage.vue';
import AdminDashboard from '../pages/AdminDashboard.vue';
import ManagerDashboard from '../pages/ManagerDashboard.vue';
import EmployeeDashboard from '../pages/EmployeeDashboard.vue';
import MainLayout from '../layouts/MainLayout.vue';
import DepartmentsPage from '../pages/DepartmentsPage.vue';
import EmployeesPage from '../pages/EmployeesPage.vue';
import TasksPage from '../pages/TasksPage.vue';
import TaskDetailsPage from '../pages/TaskDetailsPage.vue';
import LeavesPage from '../pages/LeavesPage.vue';
import LeaveDetailsPage from '../pages/LeaveDetailsPage.vue';
import AnnouncementsPage from '../pages/AnnouncementsPage.vue';
import EmployeeAnnouncementsPage from '../pages/EmployeeAnnouncementsPage.vue';
import ReportsPage from '../pages/ReportsPage.vue';
import NotificationsPage from '../pages/NotificationsPage.vue';
import ProfilePage from '../pages/ProfilePage.vue';
import EmployeeCreatePage from '../pages/EmployeeCreatePage.vue';
import EmployeeDetailPage from '../pages/EmployeeDetailPage.vue';
import EmployeeImportPage from '../pages/EmployeeImportPage.vue';
import ForcePasswordChangePage from '../pages/ForcePasswordChangePage.vue';
import KanbanPage from '../pages/KanbanPage.vue';
import CalendarPage from '../pages/CalendarPage.vue';
import { authStore, restoreAuth } from '../stores/authStore';

const rolePath = (role) => `/${role}/dashboard`;
const routes = [
  { path: '/login', component: LoginPage, meta: { guestOnly: true } },
  { path: '/change-password', component: ForcePasswordChangePage, meta: { authOnly: true, passwordChange: true } },
  { path: '/', redirect: () => authStore.user ? rolePath(authStore.user.role) : '/login' },
  { path: '/admin/dashboard', component: MainLayout, meta: { roles: ['admin'] }, children: [{ path: '', component: AdminDashboard }] },
  { path: '/admin/departments', component: MainLayout, meta: { roles: ['admin'] }, children: [{ path: '', component: DepartmentsPage }] },
  { path: '/admin/employees', component: MainLayout, meta: { roles: ['admin'] }, children: [{ path: '', component: EmployeesPage }] },
  { path: '/admin/employees/add', component: MainLayout, meta: { roles: ['admin'] }, children: [{ path: '', component: EmployeeCreatePage }] },
  { path: '/admin/employees/:id', component: MainLayout, meta: { roles: ['admin'] }, children: [{ path: '', component: EmployeeDetailPage }] },
  { path: '/admin/employee-import', component: MainLayout, meta: { roles: ['admin'] }, children: [{ path: '', component: EmployeeImportPage }] },
  { path: '/manager/dashboard', component: MainLayout, meta: { roles: ['manager'] }, children: [{ path: '', component: ManagerDashboard }] },
  { path: '/employee/dashboard', component: MainLayout, meta: { roles: ['employee'] }, children: [{ path: '', component: EmployeeDashboard }] },
  { path: '/manager/tasks', component: MainLayout, meta: { roles: ['manager'] }, children: [{ path: '', component: TasksPage }] },
  { path: '/employee/tasks', component: MainLayout, meta: { roles: ['employee'] }, children: [{ path: '', component: TasksPage }] },
  { path: '/manager/kanban', component: MainLayout, meta: { roles: ['manager'] }, children: [{ path: '', component: KanbanPage }] },
  { path: '/employee/kanban', component: MainLayout, meta: { roles: ['employee'] }, children: [{ path: '', component: KanbanPage }] },
  { path: '/admin/kanban', component: MainLayout, meta: { roles: ['admin'] }, children: [{ path: '', component: KanbanPage }] },
  { path: '/manager/calendar', component: MainLayout, meta: { roles: ['manager'] }, children: [{ path: '', component: CalendarPage }] },
  { path: '/employee/calendar', component: MainLayout, meta: { roles: ['employee'] }, children: [{ path: '', component: CalendarPage }] },
  { path: '/admin/calendar', component: MainLayout, meta: { roles: ['admin'] }, children: [{ path: '', component: CalendarPage }] },
  { path: '/tasks/:id', component: MainLayout, meta: { roles: ['admin', 'manager', 'employee'] }, children: [{ path: '', component: TaskDetailsPage }] },
  { path: '/employee/leaves', component: MainLayout, meta: { roles: ['employee'] }, children: [{ path: '', component: LeavesPage }] },
  { path: '/manager/leaves', component: MainLayout, meta: { roles: ['manager'] }, children: [{ path: '', component: LeavesPage }] },
  { path: '/leaves/:id', component: MainLayout, meta: { roles: ['admin', 'manager', 'employee'] }, children: [{ path: '', component: LeaveDetailsPage }] },
  { path: '/admin/announcements', component: MainLayout, meta: { roles: ['admin'] }, children: [{ path: '', component: AnnouncementsPage }] },
  { path: '/manager/announcements', component: MainLayout, meta: { roles: ['manager'] }, children: [{ path: '', component: AnnouncementsPage }] },
  { path: '/employee/announcements', component: MainLayout, meta: { roles: ['employee'] }, children: [{ path: '', component: EmployeeAnnouncementsPage }] },
  { path: '/admin/reports', component: MainLayout, meta: { roles: ['admin'] }, children: [{ path: '', component: ReportsPage }] },
  { path: '/manager/reports', component: MainLayout, meta: { roles: ['manager'] }, children: [{ path: '', component: ReportsPage }] },
  { path: '/notifications', component: MainLayout, meta: { roles: ['admin', 'manager', 'employee'] }, children: [{ path: '', component: NotificationsPage }] },
  { path: '/profile', component: MainLayout, meta: { roles: ['admin', 'manager', 'employee'] }, children: [{ path: '', component: ProfilePage }] },
  { path: '/:catchAll(.*)*', redirect: '/' }
];
const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach(async (to) => {
  if (!authStore.ready) await restoreAuth();
  if (to.meta.guestOnly && authStore.user) return authStore.user.must_change_password ? '/change-password' : rolePath(authStore.user.role);
  if (to.meta.authOnly && !authStore.user) return { path: '/login', query: { redirect: to.fullPath } };
  if (authStore.user?.must_change_password && to.path !== '/change-password') return '/change-password';
  if (to.path === '/change-password' && authStore.user && !authStore.user.must_change_password) return rolePath(authStore.user.role);
  if (to.meta.roles) {
    if (!authStore.user) return { path: '/login', query: { redirect: to.fullPath } };
    if (!to.meta.roles.includes(authStore.user.role)) return rolePath(authStore.user.role);
  }
  return true;
});
export default router;

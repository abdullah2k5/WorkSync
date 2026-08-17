<template>
  <q-layout view="hHh Lpr fFf">
    <q-header class="header-bar">
      <q-toolbar class="q-px-lg">
        <q-btn flat round icon="menu" @click="drawer = !drawer" />

        <div class="text-subtitle1 text-weight-bold q-ml-md gt-xs">WorkSync</div>

        <q-space />

        <q-btn flat round icon="notifications_none" class="notification-trigger" @click="notificationMenu = !notificationMenu">
          <q-badge v-if="unread > 0" color="red" floating>{{ unread }}</q-badge>
        </q-btn>

        <q-menu v-model="notificationMenu" target=".notification-trigger" anchor="bottom right" self="top right" fit :offset="[0, 10]">
          <q-card style="min-width: 360px; max-width: 420px;">
            <q-card-section class="row items-center no-wrap q-py-sm">
              <div class="text-subtitle1 text-weight-bold">Notifications</div>
              <q-space />
              <q-badge color="red" :label="unread + ' unread'" />
              <q-btn flat round size="sm" icon="done_all" :loading="marking" @click="markAll">
                <q-tooltip>Mark all as read</q-tooltip>
              </q-btn>
            </q-card-section>

            <q-separator />

            <q-scroll-area style="max-height: 400px;">
              <div v-if="loadingNotifs" class="text-center q-pa-lg">
                <q-spinner color="primary" size="30px" />
              </div>

              <div v-else-if="!notifications.length" class="text-center q-pa-lg">
                <q-icon name="notifications_none" size="40px" color="indigo-3" />
                <div class="text-subtitle2 q-mt-sm">No notifications</div>
                <div class="text-caption muted">Relevant updates will appear here when available.</div>
              </div>

              <q-list v-else separator>
                <q-item
                  v-for="n in notifications.slice(0, 8)"
                  :key="n.id"
                  clickable
                  @click="openNotif(n)"
                  :class="n.is_read ? '' : 'bg-indigo-1'"
                >
                  <q-item-section avatar>
                    <q-icon :name="iconFor(n.type)" :color="colorFor(n.type)" size="24px" />
                  </q-item-section>

                  <q-item-section>
                    <q-item-label class="text-weight-bold text-body2">{{ n.title }}</q-item-label>
                    <q-item-label caption class="ellipsis-2-lines">{{ n.message }}</q-item-label>
                    <q-item-label caption class="text-caption">{{ formatDate(n.created_at) }}</q-item-label>
                  </q-item-section>

                  <q-item-section v-if="!n.is_read" side>
                    <q-badge color="positive" label="New" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-scroll-area>
          </q-card>
        </q-menu>

        <q-btn flat round icon="person" to="/profile" aria-label="Profile" />

        <q-btn flat round icon="logout" @click="logoutUser" />
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawer" show-if-above bordered :width="240" class="sidebar">
      <q-list padding>
      <div class="row items-center q-px-md q-py-lg"><div class="brand-mark">W</div><div class="text-subtitle1 text-weight-bold q-ml-sm text-white">WorkSync</div></div>
        <q-item clickable :to="dashboardPath" exact>
          <q-item-section avatar>
            <q-icon name="dashboard" />
          </q-item-section>
          <q-item-section>Dashboard</q-item-section>
        </q-item>

        <q-item v-if="role === 'admin'" clickable to="/admin/departments">
          <q-item-section avatar>
            <q-icon name="apartment" />
          </q-item-section>
          <q-item-section>Departments</q-item-section>
        </q-item>

        <q-item v-if="role === 'admin'" clickable to="/admin/employees">
          <q-item-section avatar>
            <q-icon name="people" />
          </q-item-section>
          <q-item-section>Employees</q-item-section>
        </q-item>

        <q-item v-if="role === 'admin'" clickable to="/admin/employee-import">
          <q-item-section avatar><q-icon name="upload_file" /></q-item-section>
          <q-item-section>Employee import</q-item-section>
        </q-item>

        <q-item clickable :to="role === 'employee' ? '/employee/tasks' : '/manager/tasks'">
          <q-item-section avatar>
            <q-icon name="assignment" />
          </q-item-section>
          <q-item-section>Tasks</q-item-section>
        </q-item>

        <q-item v-if="role === 'admin' || role === 'manager' || role === 'employee'" clickable :to="role === 'admin' ? '/admin/kanban' : role === 'employee' ? '/employee/kanban' : '/manager/kanban'">
          <q-item-section avatar><q-icon name="view_kanban" /></q-item-section>
          <q-item-section>Kanban board</q-item-section>
        </q-item>

        <q-item v-if="role === 'admin' || role === 'manager' || role === 'employee'" clickable :to="role === 'admin' ? '/admin/calendar' : role === 'employee' ? '/employee/calendar' : '/manager/calendar'">
          <q-item-section avatar><q-icon name="calendar_month" /></q-item-section>
          <q-item-section>Calendar</q-item-section>
        </q-item>

        <q-item v-if="role === 'manager' || role === 'employee'" clickable :to="role === 'employee' ? '/employee/leaves' : '/manager/leaves'">
          <q-item-section avatar>
            <q-icon name="event" />
          </q-item-section>
          <q-item-section>Leaves</q-item-section>
        </q-item>

        <q-item v-if="role !== 'employee'" clickable :to="role === 'admin' ? '/admin/announcements' : '/manager/announcements'">
          <q-item-section avatar>
            <q-icon name="campaign" />
          </q-item-section>
          <q-item-section>Announcements</q-item-section>
        </q-item>

        <q-item v-if="role === 'employee'" clickable to="/employee/announcements">
          <q-item-section avatar>
            <q-icon name="campaign" />
          </q-item-section>
          <q-item-section>Announcements</q-item-section>
        </q-item>

        <q-item v-if="role === 'admin' || role === 'manager'" clickable :to="role === 'admin' ? '/admin/reports' : '/manager/reports'">
          <q-item-section avatar>
            <q-icon name="bar_chart" />
          </q-item-section>
          <q-item-section>Reports</q-item-section>
        </q-item>

        <q-item clickable to="/notifications">
          <q-item-section avatar>
            <q-icon name="notifications" />
          </q-item-section>
          <q-item-section>Notifications</q-item-section>
        </q-item>

        <q-item clickable to="/profile">
          <q-item-section avatar>
            <q-icon name="person" />
          </q-item-section>
          <q-item-section>Profile</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Notify } from 'quasar'
import { authStore, logout } from '../stores/authStore'
import api from '../services/api'

const router = useRouter()
const drawer = ref(true)
const role = computed(() => authStore.user?.role)
const notificationMenu = ref(false)
const notifications = ref([])
const unread = ref(0)
const loadingNotifs = ref(false)
const marking = ref(false)

let notificationStream = null
let notificationReconnectTimer = null

const dashboardPath = computed(() => `/${role.value}/dashboard`)

const iconFor = (type) => ({
  task: 'assignment',
  leave: 'event_available',
  announcement: 'campaign',
  system: 'notifications'
})[type] || 'notifications'

const colorFor = (type) => ({
  task: 'primary',
  leave: 'positive',
  announcement: 'orange',
  system: 'blue-grey'
})[type] || 'blue-grey'

function formatDate(value) {
  const dt = new Date(value.replace(' ', 'T') + 'Z')
  const now = new Date()
  const diff = now - dt

  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return dt.toLocaleDateString()
}

async function loadNotifications() {
  try {
    const [list, count] = await Promise.all([
      api.get('/notifications?limit=20'),
      api.get('/notifications/unread-count')
    ])
    notifications.value = list.data.data
    unread.value = count.data.data.count
  } catch {
    unread.value = 0
  }
}

async function refreshUnread() {
  try {
    const response = await api.get('/notifications/unread-count')
    unread.value = response.data.data.count
  } catch {
    unread.value = 0
  }
}

async function markAll() {
  marking.value = true
  try {
    await api.post('/notifications/read-all')
    unread.value = 0
    notifications.value.forEach((notification) => {
      notification.is_read = 1
    })
  } catch {
    // ignore
  } finally {
    marking.value = false
  }
}

async function openNotif(notification) {
  if (!notification.is_read) {
    try {
      await api.get(`/notifications/${notification.id}/read`)
      notification.is_read = 1
      await refreshUnread()
    } catch {
      // ignore
    }
  }

  notificationMenu.value = false

  const type = notification.related_entity_type
  const id = notification.related_entity_id

  if (type === 'task' && id) router.push(`/tasks/${id}`)
  else if (type === 'leave' && id) router.push(`/leaves/${id}`)
  else if (type === 'announcement') router.push(role.value === 'employee' ? '/employee/announcements' : `/${role.value}/announcements`)
  else if (type === 'system') router.push(dashboardPath.value)
}

function logoutUser() {
  logout()
  router.push('/login')
}

function connectNotificationStream() {
  if (!authStore.user || !authStore.token) return

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
  const streamUrl = `${baseUrl}/notifications/stream?token=${encodeURIComponent(authStore.token)}`

  if (notificationStream) {
    notificationStream.close()
  }

  notificationStream = new EventSource(streamUrl)

  notificationStream.addEventListener('notification', (event) => {
    const payload = JSON.parse(event.data)
    const incoming = payload.notification
    if (!incoming) return

    const found = notifications.value.find((item) => item.id === incoming.id)
    if (found) Object.assign(found, incoming)
    else {
      notifications.value.unshift(incoming)
      if (notifications.value.length > 20) {
        notifications.value = notifications.value.slice(0, 20)
      }
    }

    Notify.create({
      type: 'positive',
      message: incoming.title || 'New notification',
      caption: incoming.message || '',
      position: 'top-right',
      timeout: 5000,
      actions: [{
        label: 'Open',
        handler: () => openNotif(incoming)
      }]
    })

    unread.value += incoming.is_read ? 0 : 1
  })

  notificationStream.addEventListener('unread_count', (event) => {
    const payload = JSON.parse(event.data)
    unread.value = Number(payload.count || 0)
  })

  notificationStream.addEventListener('error', () => {
    if (notificationReconnectTimer) return

    notificationReconnectTimer = setTimeout(async () => {
      notificationReconnectTimer = null
      try {
        await api.get('/auth/me')
        if (notificationStream) notificationStream.close()
        connectNotificationStream()
      } catch {
        logout()
        router.push('/login')
      }
    }, 3000)
  })
}

onMounted(async () => {
  if (!authStore.user) return

  loadingNotifs.value = true
  await loadNotifications()
  loadingNotifs.value = false
  connectNotificationStream()
})

onBeforeUnmount(() => {
  if (notificationReconnectTimer) clearTimeout(notificationReconnectTimer)
  if (notificationStream) {
    notificationStream.close()
  }
})
</script>

<template>
  <q-layout view="hHh Lpr fFf">

    <!-- ==================== HEADER ==================== -->
    <q-header class="header-bar">
      <q-toolbar class="q-px-lg">

        <!-- Menu -->
        <q-btn
          flat
          round
          icon="menu"
          aria-label="Menu"
          @click="drawer = !drawer"
        />

        <!-- Brand -->
        <div class="text-subtitle1 text-weight-bold q-ml-md gt-xs">
          WorkSync
        </div>

        <q-space />

        <!-- ==================== NOTIFICATION AREA ==================== -->
        <div class="notification-container">

          <!-- Bell -->
          <q-btn
            flat
            round
            icon="notifications_none"
            aria-label="Notifications"
            class="notification-button"
            @click.stop="toggleNotificationMenu"
          >
            <q-badge
              v-if="unread > 0"
              color="red"
              floating
            >
              {{ unread }}
            </q-badge>
          </q-btn>

          <!-- Notification Panel -->
          <div
            v-if="notificationMenu"
            class="notification-panel"
            @click.stop
          >

            <!-- Header -->
            <div class="notification-header">

              <div class="text-subtitle1 text-weight-bold">
                Notifications
              </div>

              <q-space />

              <q-badge
                color="red"
                :label="`${unread} unread`"
              />

              <q-btn
                flat
                round
                size="sm"
                icon="done_all"
                :loading="marking"
                @click.stop="markAll"
              >
                <q-tooltip>
                  Mark all as read
                </q-tooltip>
              </q-btn>

            </div>

            <q-separator />

            <!-- Content -->
            <q-scroll-area class="notification-scroll">

              <!-- Loading -->
              <div
                v-if="loadingNotifs"
                class="text-center q-pa-lg"
              >
                <q-spinner
                  color="primary"
                  size="30px"
                />
              </div>

              <!-- Empty -->
              <div
                v-else-if="!notifications.length"
                class="text-center q-pa-lg"
              >

                <q-icon
                  name="notifications_none"
                  size="40px"
                  color="indigo-3"
                />

                <div class="text-subtitle2 q-mt-sm">
                  No notifications
                </div>

                <div class="text-caption text-grey-6 q-mt-xs">
                  Relevant updates will appear here when available.
                </div>

              </div>

              <!-- Notification List -->
              <q-list
                v-else
                separator
              >

                <q-item
                  v-for="n in notifications.slice(0, 8)"
                  :key="n.id"
                  clickable
                  @click.stop="openNotif(n)"
                  :class="n.is_read ? '' : 'bg-indigo-1'"
                >

                  <q-item-section avatar>
                    <q-icon
                      :name="iconFor(n.type)"
                      :color="colorFor(n.type)"
                      size="24px"
                    />
                  </q-item-section>

                  <q-item-section>

                    <q-item-label
                      class="text-weight-bold text-body2"
                    >
                      {{ n.title }}
                    </q-item-label>

                    <q-item-label
                      caption
                      class="ellipsis-2-lines"
                    >
                      {{ n.message }}
                    </q-item-label>

                    <q-item-label
                      caption
                      class="text-caption"
                    >
                      {{ formatDate(n.created_at) }}
                    </q-item-label>

                  </q-item-section>

                  <q-item-section
                    v-if="!n.is_read"
                    side
                  >
                    <q-badge
                      color="positive"
                      label="New"
                    />
                  </q-item-section>

                </q-item>

              </q-list>

            </q-scroll-area>

            <!-- Footer -->
            <q-separator />

            <div class="notification-footer">

              <q-btn
                flat
                color="primary"
                label="View all notifications"
                @click.stop="goToNotifications"
              />

            </div>

          </div>

        </div>

        <!-- Profile -->
        <q-btn
          flat
          round
          icon="person"
          to="/profile"
          aria-label="Profile"
        />

        <!-- Logout -->
        <q-btn
          flat
          round
          icon="logout"
          aria-label="Logout"
          @click="logoutUser"
        />

      </q-toolbar>
    </q-header>


    <!-- ==================== SIDEBAR ==================== -->
    <q-drawer
      v-model="drawer"
      show-if-above
      bordered
      :width="240"
      class="sidebar"
    >

      <q-list padding>

        <!-- Brand -->
        <div class="row items-center q-px-md q-py-lg">

          <div class="brand-mark">
            W
          </div>

          <div
            class="text-subtitle1 text-weight-bold q-ml-sm text-white"
          >
            WorkSync
          </div>

        </div>


        <!-- Dashboard -->
        <q-item
          clickable
          :to="dashboardPath"
          exact
        >
          <q-item-section avatar>
            <q-icon name="dashboard" />
          </q-item-section>

          <q-item-section>
            Dashboard
          </q-item-section>
        </q-item>


        <!-- Departments -->
        <q-item
          v-if="role === 'admin'"
          clickable
          to="/admin/departments"
        >
          <q-item-section avatar>
            <q-icon name="apartment" />
          </q-item-section>

          <q-item-section>
            Departments
          </q-item-section>
        </q-item>


        <!-- Employees -->
        <q-item
          v-if="role === 'admin'"
          clickable
          to="/admin/employees"
        >
          <q-item-section avatar>
            <q-icon name="people" />
          </q-item-section>

          <q-item-section>
            Employees
          </q-item-section>
        </q-item>


        <!-- Employee Import -->
        <q-item
          v-if="role === 'admin'"
          clickable
          to="/admin/employee-import"
        >
          <q-item-section avatar>
            <q-icon name="upload_file" />
          </q-item-section>

          <q-item-section>
            Employee import
          </q-item-section>
        </q-item>


        <!-- Tasks -->
        <q-item
          clickable
          :to="
            role === 'employee'
              ? '/employee/tasks'
              : '/manager/tasks'
          "
        >
          <q-item-section avatar>
            <q-icon name="assignment" />
          </q-item-section>

          <q-item-section>
            Tasks
          </q-item-section>
        </q-item>


        <!-- Kanban -->
        <q-item
          v-if="
            role === 'admin' ||
            role === 'manager' ||
            role === 'employee'
          "
          clickable
          :to="
            role === 'admin'
              ? '/admin/kanban'
              : role === 'employee'
                ? '/employee/kanban'
                : '/manager/kanban'
          "
        >
          <q-item-section avatar>
            <q-icon name="view_kanban" />
          </q-item-section>

          <q-item-section>
            Kanban board
          </q-item-section>
        </q-item>


        <!-- Calendar -->
        <q-item
          v-if="
            role === 'admin' ||
            role === 'manager' ||
            role === 'employee'
          "
          clickable
          :to="
            role === 'admin'
              ? '/admin/calendar'
              : role === 'employee'
                ? '/employee/calendar'
                : '/manager/calendar'
          "
        >
          <q-item-section avatar>
            <q-icon name="calendar_month" />
          </q-item-section>

          <q-item-section>
            Calendar
          </q-item-section>
        </q-item>


        <!-- Leaves -->
        <q-item
          v-if="
            role === 'manager' ||
            role === 'employee'
          "
          clickable
          :to="
            role === 'employee'
              ? '/employee/leaves'
              : '/manager/leaves'
          "
        >
          <q-item-section avatar>
            <q-icon name="event" />
          </q-item-section>

          <q-item-section>
            Leaves
          </q-item-section>
        </q-item>


        <!-- Announcements -->
        <q-item
          v-if="role !== 'employee'"
          clickable
          :to="
            role === 'admin'
              ? '/admin/announcements'
              : '/manager/announcements'
          "
        >
          <q-item-section avatar>
            <q-icon name="campaign" />
          </q-item-section>

          <q-item-section>
            Announcements
          </q-item-section>
        </q-item>


        <!-- Employee Announcements -->
        <q-item
          v-if="role === 'employee'"
          clickable
          to="/employee/announcements"
        >
          <q-item-section avatar>
            <q-icon name="campaign" />
          </q-item-section>

          <q-item-section>
            Announcements
          </q-item-section>
        </q-item>


        <!-- Reports -->
        <q-item
          v-if="
            role === 'admin' ||
            role === 'manager'
          "
          clickable
          :to="
            role === 'admin'
              ? '/admin/reports'
              : '/manager/reports'
          "
        >
          <q-item-section avatar>
            <q-icon name="bar_chart" />
          </q-item-section>

          <q-item-section>
            Reports
          </q-item-section>
        </q-item>


        <!-- Notifications -->
        <q-item
          clickable
          to="/notifications"
        >
          <q-item-section avatar>
            <q-icon name="notifications" />
          </q-item-section>

          <q-item-section>
            Notifications
          </q-item-section>
        </q-item>


        <!-- Profile -->
        <q-item
          clickable
          to="/profile"
        >
          <q-item-section avatar>
            <q-icon name="person" />
          </q-item-section>

          <q-item-section>
            Profile
          </q-item-section>
        </q-item>

      </q-list>

    </q-drawer>


    <!-- ==================== PAGE ==================== -->
    <q-page-container>
      <router-view />
    </q-page-container>

  </q-layout>
</template>


<script setup>
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount
} from 'vue'

import { useRouter } from 'vue-router'
import { Notify } from 'quasar'

import {
  authStore,
  logout
} from '../stores/authStore'

import api from '../services/api'


/* ========================================
   ROUTER
======================================== */

const router = useRouter()


/* ========================================
   LAYOUT
======================================== */

const drawer = ref(true)

const role = computed(() => {
  return authStore.user?.role
})

const dashboardPath = computed(() => {
  return `/${role.value}/dashboard`
})


/* ========================================
   NOTIFICATIONS
======================================== */

const notificationMenu = ref(false)

const notifications = ref([])

const unread = ref(0)

const loadingNotifs = ref(false)

const marking = ref(false)


/* ========================================
   SSE
======================================== */

let notificationStream = null

let notificationReconnectTimer = null


/* ========================================
   CLOSE MENU WHEN CLICKING OUTSIDE
======================================== */

function handleDocumentClick(event) {
  const target = event.target

  if (!target) {
    return
  }

  const notificationContainer =
    document.querySelector('.notification-container')

  if (
    notificationContainer &&
    !notificationContainer.contains(target)
  ) {
    notificationMenu.value = false
  }
}


/* ========================================
   NOTIFICATION MENU
======================================== */

function toggleNotificationMenu() {
  console.log('[Notifications] Bell clicked')

  notificationMenu.value =
    !notificationMenu.value

  console.log(
    '[Notifications] Menu state:',
    notificationMenu.value
  )

  if (notificationMenu.value) {
    loadNotifications()
  }
}


/* ========================================
   VIEW ALL
======================================== */

function goToNotifications() {
  console.log(
    '[Notifications] Opening notifications page'
  )

  notificationMenu.value = false

  router.push('/notifications')
}


/* ========================================
   ICONS
======================================== */

const iconFor = (type) => {
  return {
    task: 'assignment',
    leave: 'event_available',
    announcement: 'campaign',
    system: 'notifications'
  }[type] || 'notifications'
}


const colorFor = (type) => {
  return {
    task: 'primary',
    leave: 'positive',
    announcement: 'orange',
    system: 'blue-grey'
  }[type] || 'blue-grey'
}


/* ========================================
   DATE FORMAT
======================================== */

function formatDate(value) {
  if (!value) {
    return ''
  }

  const stringValue = String(value)

  const normalized =
    stringValue.includes('T')
      ? stringValue
      : stringValue.replace(' ', 'T')

  const dateString =
    normalized.endsWith('Z')
      ? normalized
      : `${normalized}Z`

  const dt = new Date(dateString)

  if (Number.isNaN(dt.getTime())) {
    return ''
  }

  const now = new Date()

  const diff = now - dt

  if (diff < 60000) {
    return 'Just now'
  }

  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m ago`
  }

  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}h ago`
  }

  return dt.toLocaleDateString()
}


/* ========================================
   LOAD NOTIFICATIONS
======================================== */

async function loadNotifications() {
  console.log(
    '[Notifications] Loading notifications...'
  )

  loadingNotifs.value = true

  try {
    const [
      listResponse,
      countResponse
    ] = await Promise.all([
      api.get('/notifications?limit=20'),
      api.get('/notifications/unread-count')
    ])

    notifications.value =
      listResponse?.data?.data || []

    unread.value =
      Number(
        countResponse?.data?.data?.count || 0
      )

    console.log(
      '[Notifications] Loaded:',
      notifications.value.length
    )

    console.log(
      '[Notifications] Unread:',
      unread.value
    )
  } catch (error) {
    console.error(
      '[Notifications] Failed to load notifications:',
      error
    )
  } finally {
    loadingNotifs.value = false
  }
}


/* ========================================
   REFRESH UNREAD
======================================== */

async function refreshUnread() {
  try {
    const response =
      await api.get(
        '/notifications/unread-count'
      )

    unread.value =
      Number(
        response?.data?.data?.count || 0
      )

    console.log(
      '[Notifications] Unread count:',
      unread.value
    )
  } catch (error) {
    console.error(
      '[Notifications] Failed to refresh unread:',
      error
    )
  }
}


/* ========================================
   MARK ALL READ
======================================== */

async function markAll() {
  console.log(
    '[Notifications] Marking all as read'
  )

  marking.value = true

  try {
    await api.post(
      '/notifications/read-all'
    )

    unread.value = 0

    notifications.value.forEach(
      (notification) => {
        notification.is_read = 1
      }
    )

    Notify.create({
      type: 'positive',
      message:
        'All notifications marked as read',
      position: 'top-right'
    })
  } catch (error) {
    console.error(
      '[Notifications] Failed to mark all as read:',
      error
    )

    Notify.create({
      type: 'negative',
      message:
        'Unable to mark notifications as read',
      position: 'top-right'
    })
  } finally {
    marking.value = false
  }
}


/* ========================================
   OPEN NOTIFICATION
======================================== */

async function openNotif(notification) {
  if (!notification) {
    return
  }

  console.log(
    '[Notifications] Opening:',
    notification
  )

  if (!notification.is_read) {
    try {
      await api.get(
        `/notifications/${notification.id}/read`
      )

      notification.is_read = 1

      await refreshUnread()
    } catch (error) {
      console.error(
        '[Notifications] Failed to mark notification as read:',
        error
      )
    }
  }

  notificationMenu.value = false

  const type =
    notification.related_entity_type

  const id =
    notification.related_entity_id

  if (type === 'task' && id) {
    router.push(`/tasks/${id}`)
  } else if (
    type === 'leave' &&
    id
  ) {
    router.push(`/leaves/${id}`)
  } else if (
    type === 'announcement'
  ) {
    router.push(
      role.value === 'employee'
        ? '/employee/announcements'
        : `/${role.value}/announcements`
    )
  } else if (
    type === 'system'
  ) {
    router.push(
      dashboardPath.value
    )
  }
}


/* ========================================
   LOGOUT
======================================== */

function logoutUser() {
  console.log(
    '[Auth] Logging out'
  )

  if (notificationStream) {
    notificationStream.close()
    notificationStream = null
  }

  logout()

  router.push('/login')
}


/* ========================================
   SSE CONNECTION
======================================== */

function connectNotificationStream() {
  if (
    !authStore.user ||
    !authStore.token
  ) {
    console.warn(
      '[Notifications] Cannot connect SSE: user/token missing'
    )

    return
  }

  const baseUrl =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000/api'

  const streamUrl =
    `${baseUrl}/notifications/stream` +
    `?token=${encodeURIComponent(
      authStore.token
    )}`

  console.log(
    '[Notifications] Connecting SSE:',
    streamUrl.replace(
      authStore.token,
      '***'
    )
  )

  if (notificationStream) {
    notificationStream.close()
  }

  notificationStream =
    new EventSource(streamUrl)


  /* ---------- OPEN ---------- */

  notificationStream.onopen = () => {
    console.log(
      '[Notifications] SSE connection opened'
    )
  }


  /* ---------- CONNECTED ---------- */

  notificationStream.addEventListener(
    'connected',
    () => {
      console.log(
        '[Notifications] SSE connected event received'
      )
    }
  )


  /* ---------- NOTIFICATION ---------- */

  notificationStream.addEventListener(
    'notification',
    (event) => {
      try {
        const payload =
          JSON.parse(event.data)

        const incoming =
          payload.notification

        if (!incoming) {
          return
        }

        console.log(
          '[Notifications] New notification:',
          incoming
        )

        const found =
          notifications.value.find(
            (item) =>
              item.id === incoming.id
          )

        if (found) {
          Object.assign(
            found,
            incoming
          )
        } else {
          notifications.value.unshift(
            incoming
          )

          if (
            notifications.value.length >
            20
          ) {
            notifications.value =
              notifications.value.slice(
                0,
                20
              )
          }
        }

        Notify.create({
          type: 'positive',
          message:
            incoming.title ||
            'New notification',
          caption:
            incoming.message || '',
          position: 'top-right',
          timeout: 5000,
          actions: [
            {
              label: 'Open',
              handler: () => {
                openNotif(incoming)
              }
            }
          ]
        })

        if (!incoming.is_read) {
          unread.value += 1
        }

      } catch (error) {
        console.error(
          '[Notifications] Invalid SSE notification:',
          error
        )
      }
    }
  )


  /* ---------- UNREAD COUNT ---------- */

  notificationStream.addEventListener(
    'unread_count',
    (event) => {
      try {
        const payload =
          JSON.parse(event.data)

        unread.value =
          Number(
            payload.count || 0
          )

        console.log(
          '[Notifications] SSE unread count:',
          unread.value
        )

      } catch (error) {
        console.error(
          '[Notifications] Invalid unread_count event:',
          error
        )
      }
    }
  )


  /* ---------- ERROR ---------- */

  notificationStream.onerror =
    (error) => {

      console.error(
        '[Notifications] SSE connection error:',
        error
      )

      if (
        notificationReconnectTimer
      ) {
        return
      }

      notificationReconnectTimer =
        setTimeout(
          async () => {

            notificationReconnectTimer =
              null

            try {

              await api.get(
                '/auth/me'
              )

              if (
                notificationStream
              ) {
                notificationStream.close()
                notificationStream = null
              }

              connectNotificationStream()

            } catch (error) {

              console.error(
                '[Notifications] Authentication check failed:',
                error
              )

              logout()

              router.push(
                '/login'
              )
            }

          },
          3000
        )
    }
}


/* ========================================
   MOUNTED
======================================== */

onMounted(async () => {

  console.log(
    '[MainLayout] Mounted'
  )

  console.log(
    '[MainLayout] User:',
    authStore.user
  )

  document.addEventListener(
    'click',
    handleDocumentClick
  )

  if (!authStore.user) {

    console.warn(
      '[MainLayout] No authenticated user'
    )

    return
  }

  await loadNotifications()

  connectNotificationStream()
})


/* ========================================
   CLEANUP
======================================== */

onBeforeUnmount(() => {

  console.log(
    '[MainLayout] Cleaning up'
  )

  document.removeEventListener(
    'click',
    handleDocumentClick
  )

  if (
    notificationReconnectTimer
  ) {
    clearTimeout(
      notificationReconnectTimer
    )

    notificationReconnectTimer =
      null
  }

  if (notificationStream) {

    notificationStream.close()

    notificationStream = null
  }
})
</script>


<style scoped>

.notification-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-button {
  position: relative;
  z-index: 1001;
}

.notification-panel {
  position: absolute;
  top: 48px;
  right: 0;
  z-index: 1000;

  width: 400px;
  max-width: calc(100vw - 30px);

  background: white;
  color: #1f2937;

  border-radius: 10px;

  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.18),
    0 2px 8px rgba(0, 0, 0, 0.08);

  overflow: hidden;
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 8px;

  padding: 12px 14px;
}

.notification-scroll {
  height: 400px;
  max-height: 400px;
}

.notification-footer {
  display: flex;
  align-items: center;
  justify-content: center;

  padding: 8px;
}

</style>
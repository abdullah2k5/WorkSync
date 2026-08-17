<template>
  <q-page class="q-pa-lg"
    ><div class="text-overline text-primary">INBOX</div>
    <div class="page-title">Notifications</div>
    <p class="muted">Stay informed about task updates, leave requests, and important activity.</p>
    <div class="row items-center q-mt-md">
      <q-btn-toggle
        v-model="filter"
        :options="[
          { label: 'All', value: 'all' },
          { label: 'Unread', value: 'unread' },
          { label: 'Read', value: 'read' },
          { label: 'Tasks', value: 'task' },
          { label: 'Leave', value: 'leave' },
          { label: 'Announcements', value: 'announcement' },
        ]"
        outline
        dense
        rounded
      /><q-space /><q-btn
        flat
        color="primary"
        icon="done_all"
        label="Mark all read"
        :loading="markingAll"
        @click="markAll"
      /><q-btn
        flat
        color="negative"
        icon="delete_sweep"
        label="Clear all"
        :loading="clearing"
        @click="clearAll"
      />
    </div>
    <div v-if="loading" class="text-center q-pa-xl">
      <q-spinner color="primary" size="40px" />
    </div>
    <div v-else-if="!filtered.length" class="text-center q-pa-xl">
      <q-icon name="notifications_none" size="48px" color="indigo-3" />
      <div class="text-h6 q-mt-sm">No notifications</div>
      <div class="muted">Relevant updates will appear here when available.</div>
    </div>
    <q-list v-else separator class="q-mt-md"
      ><q-item
        v-for="n in filtered"
        :key="n.id"
        clickable
        @click="openNotification(n)"
        :class="n.is_read ? 'bg-white' : 'bg-indigo-1'"
        class="rounded-borders q-mb-sm"
        ><q-item-section avatar
          ><q-icon
            :name="iconFor(n.type)"
            :color="colorFor(n.type)"
            size="28px" /><q-badge
            v-if="!n.is_read"
            color="positive"
            floating
            label="New" /></q-item-section
        ><q-item-section
          ><q-item-label class="text-weight-bold">{{ n.title }}</q-item-label
          ><q-item-label caption>{{ n.message }}</q-item-label
          ><q-item-label caption class="q-mt-xs">{{
            formatDate(n.created_at)
          }}</q-item-label></q-item-section
        ><q-item-section side
          ><div class="row q-gutter-xs">
            <q-btn
              v-if="!n.is_read"
              flat
              round
              size="sm"
              icon="done"
              color="primary"
              @click.stop="markRead(n)"
            /><q-btn
              flat
              round
              size="sm"
              icon="delete"
              color="negative"
              @click.stop="deleteOne(n)"
            /></div></q-item-section></q-item></q-list
  ></q-page>
</template>
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import api from "../services/api";
const $q = useQuasar(),
  router = useRouter(),
  rows = ref([]),
  loading = ref(false),
  markingAll = ref(false),
  clearing = ref(false),
  filter = ref("all");
const filtered = computed(() => {
  let list = rows.value;
  if (filter.value === "unread") list = list.filter((n) => !n.is_read);
  else if (filter.value === "read") list = list.filter((n) => n.is_read);
  else if (
    filter.value === "task" ||
    filter.value === "leave" ||
    filter.value === "announcement"
  )
    list = list.filter((n) => n.type === filter.value);
  return list;
});
const iconFor = (t) =>
  ({
    task: "assignment",
    leave: "event_available",
    announcement: "campaign",
    system: "notifications",
  })[t] || "notifications";
const colorFor = (t) =>
  ({
    task: "primary",
    leave: "positive",
    announcement: "orange",
    system: "blue-grey",
  })[t] || "blue-grey";
function formatDate(d) {
  const dt = new Date(d.replace(" ", "T") + "Z");
  const now = new Date();
  const diff = now - dt;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return dt.toLocaleDateString();
}
async function load() {
  loading.value = true;
  try {
    rows.value = (await api.get("/notifications")).data.data;
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.message || "Failed to load notifications",
    });
  } finally {
    loading.value = false;
  }
}
async function openNotification(n) {
  if (!n.is_read) await markRead(n);
  const type = n.related_entity_type;
  const id = n.related_entity_id;
  if (type === "task" && id) router.push(`/tasks/${id}`);
  else if (type === "leave" && id) router.push(`/leaves/${id}`);
  else if (type === "announcement")
    router.push(
      authRole() === "employee"
        ? "/employee/announcements"
        : `/${authRole()}/announcements`,
    );
  else if (type === "task") router.push(`/${authRole()}/tasks`);
  else if (type === "leave") router.push(`/${authRole()}/leaves`);
}
function authRole() {
  return (
    JSON.parse(localStorage.getItem("worksync_auth") || "null")?.user?.role ||
    "employee"
  );
}
async function markRead(n) {
  try {
    await api.get(`/notifications/${n.id}/read`);
    n.is_read = 1;
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.message || "Failed to mark as read",
    });
  }
}
async function markAll() {
  markingAll.value = true;
  try {
    await api.post("/notifications/read-all");
    rows.value.forEach((n) => (n.is_read = 1));
    $q.notify({
      type: "positive",
      message: "All notifications marked as read",
    });
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.message || "Failed",
    });
  } finally {
    markingAll.value = false;
  }
}
async function clearAll() {
  if (!confirm("Clear all notifications?")) return;
  clearing.value = true;
  try {
    await api.delete("/notifications");
    rows.value = [];
    $q.notify({ type: "positive", message: "All notifications cleared" });
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.message || "Failed",
    });
  } finally {
    clearing.value = false;
  }
}
async function deleteOne(n) {
  try {
    await api.delete(`/notifications/${n.id}`);
    rows.value = rows.value.filter((x) => x.id !== n.id);
    $q.notify({ type: "positive", message: "Notification deleted" });
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.message || "Failed to delete",
    });
  }
}
onMounted(load);
</script>

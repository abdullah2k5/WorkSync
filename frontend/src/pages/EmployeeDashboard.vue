<template>
  <q-page class="q-pa-lg"
    ><div class="text-overline text-primary">MY WORKSPACE</div>
    <div class="page-title">
      My workspace
    </div>
    <p class="muted">Monitor your workload, priorities, and recent activity.</p>
    <DashboardCards :cards="cards" /><q-card flat bordered class="q-mt-xl"
      ><q-card-section class="row items-center"
        ><div>
          <div class="text-h6">My Recent Tasks</div>
          <div class="muted">Your latest assigned work.</div>
        </div>
        <q-space /><q-btn
          flat
          color="primary"
          label="View all"
          to="/employee/tasks" /></q-card-section
      ><q-separator /><q-list v-if="recent.length" separator
        ><q-item
          v-for="task in recent"
          :key="task.id"
          clickable
          @click="router.push(`/tasks/${task.id}`)"
          ><q-item-section
            ><q-item-label class="text-weight-bold">{{
              task.title
            }}</q-item-label
            ><q-item-label caption
              >Due {{ task.due_date }}</q-item-label
            ></q-item-section
          ><q-item-section side top
            ><div class="row q-gutter-xs">
              <q-badge
                :color="priorityColor(task.priority)"
                :label="task.priority"
              /><q-badge
                :color="statusColor(task.status)"
                :label="task.status"
              />
            </div>
            <div class="text-caption text-right q-mt-sm">
              {{ task.progress }}%
            </div></q-item-section
          ></q-item
        ></q-list
      ><q-card-section v-else class="text-center q-pa-xl"
        ><q-icon name="assignment_turned_in" size="48px" color="indigo-3" />
        <div class="text-h6 q-mt-sm">No tasks available</div>
        <div class="muted">
          New tasks assigned to you will appear here.
        </div></q-card-section
      ></q-card
    ><q-card flat bordered class="q-mt-xl"
      ><q-card-section class="row items-center"
        ><div>
          <div class="text-h6">Leave summary</div>
          <div class="muted">Your current leave requests.</div>
        </div>
        <q-space /><q-btn flat color="primary" label="View all" to="/employee/leaves" /></q-card-section
      ><q-separator /><q-list separator
        ><q-item v-for="item in leaveSummary" :key="item.status"
          ><q-item-section>{{ item.status }}</q-item-section
          ><q-item-section side><q-badge color="primary" :label="String(item.count)" /></q-item-section></q-item
        ></q-list></q-card
    ><q-card flat bordered class="q-mt-xl"
      ><q-card-section class="row items-center"
        ><div>
          <div class="text-h6">Latest Updates</div>
          <div class="muted">Recent company announcements.</div>
        </div>
        <q-space /><q-btn
          flat
          color="primary"
          label="View all"
          to="/employee/announcements" /></q-card-section
      ><q-separator />
      <div v-if="announcementsLoading" class="text-center q-pa-lg">
        <q-spinner color="primary" size="30px" />
      </div>
      <q-list v-else-if="announcements.length" separator
        ><q-item v-for="a in announcements" :key="a.id"
          ><q-item-section
            ><q-item-label class="text-weight-bold">{{ a.title }}</q-item-label
            ><q-item-label caption class="ellipsis-2-lines">{{
              a.message
            }}</q-item-label></q-item-section
          ><q-item-section side top
            ><div class="row q-gutter-xs">
              <q-badge
                :color="priorityColor(a.priority)"
                :label="cap(a.priority)"
              />
            </div>
            <div class="text-caption text-right q-mt-sm muted">
              {{ a.created_at }}
            </div></q-item-section
          ></q-item
        ></q-list
      ><q-card-section v-else class="text-center q-pa-xl"
        ><q-icon name="campaign" size="48px" color="indigo-3" />
        <div class="text-h6 q-mt-sm">No announcements available</div>
        <div class="muted">
          Company updates will appear here.
        </div></q-card-section
      ></q-card
    ></q-page
  >
</template>
<script setup>
import { ref, onMounted, onActivated } from "vue";
import { useRouter } from "vue-router";
import { authStore } from "../stores/authStore";
import api from "../services/api";
import DashboardCards from "../components/DashboardCards.vue";
const router = useRouter(),
  recent = ref([]),
  announcements = ref([]),
  leaveSummary = ref([]),
  announcementsLoading = ref(false);
const cards = ref([
  {
    label: "Total Tasks",
    icon: "assignment",
    color: "indigo",
    value: 0,
    preview: false,
  },
  {
    label: "To Do",
    icon: "schedule",
    color: "orange",
    value: 0,
    preview: false,
  },
  {
    label: "In Progress",
    icon: "autorenew",
    color: "primary",
    value: 0,
    preview: false,
  },
  {
    label: "Completed",
    icon: "task_alt",
    color: "positive",
    value: 0,
    preview: false,
  },
  {
    label: "Overdue Tasks",
    icon: "warning",
    color: "negative",
    value: 0,
    preview: false,
  },
  { label: "Due Today", icon: "today", color: "warning", value: 0, preview: false },
  { label: "Due This Week", icon: "date_range", color: "primary", value: 0, preview: false },
]);
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : "");
async function load() {
  try {
    const [dashboard, leave] = await Promise.all([
      api.get("/dashboard/employee"),
      api.get("/leaves/summary"),
    ]);
    const d = dashboard.data.data;
    recent.value = d.recentTasks;
    leaveSummary.value = Object.entries(leave.data.data).map(([status, count]) => ({ status, count }));
    const values = [
      d.totalTasks,
      d.todoTasks,
      d.inProgressTasks,
      d.completedTasks,
      d.overdueTasks,
      d.dueToday,
      d.dueThisWeek,
    ];
    cards.value = cards.value.map((c, i) => ({ ...c, value: values[i] }));
  } catch {}
}
async function loadAnnouncements() {
  announcementsLoading.value = true;
  try {
    announcements.value = (
      await api.get("/announcements/mine")
    ).data.data.slice(0, 3);
  } finally {
    announcementsLoading.value = false;
  }
}
onMounted(() => {
  load();
  loadAnnouncements();
});
onActivated(() => {
  load();
  loadAnnouncements();
});
const priorityColor = (x) =>
  x === "High" || x === "urgent"
    ? "negative"
    : x === "Medium" || x === "important"
      ? "orange"
      : "positive";
const statusColor = (x) =>
  x === "Completed" ? "positive" : x === "In Progress" ? "primary" : "grey-6";
</script>

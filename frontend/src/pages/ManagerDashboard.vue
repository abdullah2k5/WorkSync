<template>
  <q-page class="q-pa-lg"
    ><div class="text-overline text-primary">TEAM WORKSPACE</div>
    <div class="page-title">
      Team workspace
    </div>
    <p class="muted">Monitor tasks, team activity, and pending operational requests.</p>
    <DashboardCards :cards="cards" />
    <div class="row q-col-gutter-lg q-mt-lg">
      <div class="col-12 col-lg-7">
        <q-card flat bordered class="q-pa-lg"
          ><div class="row items-center">
            <div class="text-h6">Team overview</div>
            <q-space /><q-badge
              color="blue-grey-1"
              text-color="grey-7"
              label="Live team data"
            />
          </div>
          <q-list separator class="q-mt-md"
            ><q-item v-for="person in people" :key="person.id"
              ><q-item-section avatar
                ><q-avatar color="indigo-1" text-color="primary">{{
                  person.name[0]
                }}</q-avatar></q-item-section
              ><q-item-section
                ><q-item-label>{{ person.name }}</q-item-label
                ><q-item-label caption>{{
                  person.role
                }}</q-item-label></q-item-section
              ><q-item-section side
                ><q-badge
                  color="positive"
                  label="Active" /></q-item-section></q-item></q-list
        ></q-card>
      </div>
      <div class="col-12 col-lg-5">
        <q-card flat bordered class="q-pa-lg"
          ><div class="text-h6">Recent activity</div>
          <div
            v-for="activity in activities"
            :key="activity.id"
            class="row items-center q-mt-lg"
          >
            <q-icon name="check_circle" color="positive" /><span
              class="q-ml-sm text-body2"
              >{{ activity.title }} · {{ activity.status }}</span
            >
          </div></q-card
        >
      </div>
    </div></q-page
  >
</template>
<script setup>
import { ref, onMounted, onActivated } from "vue";
import { authStore } from "../stores/authStore";
import DashboardCards from "../components/DashboardCards.vue";
import api from "../services/api";
const people = ref([]), activities = ref([]);
const cards = ref([
  { label: "Team Members", icon: "groups", color: "indigo", value: 0, preview: false },
  { label: "Total Tasks", icon: "pending_actions", color: "orange", value: 0, preview: false },
  { label: "Pending Tasks", icon: "schedule", color: "warning", value: 0, preview: false },
  { label: "In Progress", icon: "autorenew", color: "primary", value: 0, preview: false },
  { label: "Completed", icon: "task_alt", color: "positive", value: 0, preview: false },
  { label: "Pending Leave Requests", icon: "event", color: "negative", value: 0, preview: false },
  { label: "Due Today", icon: "today", color: "warning", value: 0, preview: false },
  { label: "Due This Week", icon: "date_range", color: "primary", value: 0, preview: false },
  { label: "Overdue Tasks", icon: "warning", color: "negative", value: 0, preview: false },
]);
async function load() {
  const [team, stats, tasks, leaves] = await Promise.all([
    api.get("/employees/my-team"),
    api.get("/tasks/stats"),
    api.get("/tasks"),
    api.get("/leaves", { params: { status: "Pending" } }),
  ]);
  people.value = team.data.data.map((person) => ({ ...person, name: `${person.first_name} ${person.last_name}`, role: person.job_position }));
  const s = stats.data.data;
  cards.value = cards.value.map((card, index) => ({ ...card, value: [people.value.length, s.total, s.todo, s.inProgress, s.completed, leaves.data.data.length, s.dueToday, s.dueThisWeek, s.overdue][index] }));
  activities.value = tasks.data.data.slice(0, 3);
}
onMounted(load);
onActivated(load);
</script>

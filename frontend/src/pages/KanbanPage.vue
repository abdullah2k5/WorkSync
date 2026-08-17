<template>
  <q-page class="q-pa-lg">
    <div class="row items-center q-mb-lg"><div><div class="text-overline text-primary">WORKFLOW</div><div class="page-title">Kanban board</div><div class="muted">Move work through the existing task status workflow.</div></div><q-space /><q-btn flat icon="refresh" label="Refresh" :loading="loading" @click="load" /></div>
    <div class="kanban-board">
      <section v-for="column in columns" :key="column.status" class="kanban-column" @dragover.prevent @drop="drop($event, column.status)"><div class="row items-center q-mb-md"><div class="text-subtitle1 text-weight-bold">{{ column.status }}</div><q-space /><q-badge color="blue-grey-1" text-color="grey-8" :label="String(column.tasks.length)" /></div><q-card v-for="task in column.tasks" :key="task.id" flat bordered class="kanban-card q-mb-sm" draggable="true" @dragstart="dragged = task" @click="router.push(`/tasks/${task.id}`)"><q-card-section class="q-pa-md"><div class="text-weight-bold">{{ task.title }}</div><div class="row q-gutter-xs q-mt-sm"><q-badge :color="priorityColor(task.priority)" :label="task.priority" /><q-badge v-if="task.due_date" color="blue-grey-1" text-color="grey-8" :label="task.due_date" /></div><div class="text-caption muted q-mt-sm">{{ task.assigned_name }}</div></q-card-section></q-card><div v-if="!column.tasks.length" class="kanban-empty">No tasks in this stage.</div></section>
    </div>
  </q-page>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import api from '../services/api'
const router = useRouter(), $q = useQuasar(), rows = ref([]), loading = ref(false), dragged = ref(null)
const columns = computed(() => ['To Do', 'In Progress', 'Completed'].map((status) => ({ status, tasks: rows.value.filter((task) => task.status === status) })))
const priorityColor = (priority) => priority === 'High' ? 'negative' : priority === 'Medium' ? 'orange' : 'positive'
async function load() { loading.value = true; try { rows.value = (await api.get('/tasks')).data.data } catch (error) { $q.notify({ type: 'negative', message: error.response?.data?.message || 'Unable to load tasks.' }) } finally { loading.value = false } }
async function drop(event, status) { event.preventDefault(); if (!dragged.value || dragged.value.status === status) return; const previous = dragged.value.status; dragged.value.status = status; try { await api.patch(`/tasks/${dragged.value.id}/progress`, { status, progress: status === 'Completed' ? 100 : status === 'To Do' ? 0 : Math.max(1, Math.min(99, dragged.value.progress || 1)) }); await load() } catch (error) { dragged.value.status = previous; $q.notify({ type: 'negative', message: error.response?.data?.message || 'Unable to update task status.' }) } finally { dragged.value = null } }
onMounted(load)
</script>

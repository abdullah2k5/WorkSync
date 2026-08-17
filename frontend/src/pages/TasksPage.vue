<template>
  <q-page class="q-pa-lg"
    ><div class="row items-center">
      <div>
        <div class="page-title">
          {{ isManager ? "Task Management" : "My Tasks" }}
        </div>
        <div class="muted">
          {{
            isManager
              ? "Create, assign, and monitor your team work."
              : "Stay focused on your assigned work."
          }}
        </div>
      </div>
      <q-space /><q-btn
        v-if="isManager"
        color="primary"
        unelevated
        rounded
        icon="add"
        label="Create Task"
        @click="open"
      />
    </div>
    <div class="row q-col-gutter-md q-mt-lg">
      <div class="col-12 col-md-5">
        <q-input
          v-model="search"
          outlined
          rounded
          dense
          placeholder="Search tasks"
          clearable
          ><template #prepend><q-icon name="search" /></template
        ></q-input>
      </div>
      <div class="col-6 col-md-3">
        <q-select
          v-model="status"
          outlined
          rounded
          dense
          clearable
          label="Status"
          :options="statuses"
        />
      </div>
      <div class="col-6 col-md-3"><q-select v-model="labelId" outlined rounded dense clearable label="Label" :options="labels" option-value="id" option-label="name" emit-value map-options /></div>
      <div class="col-6 col-md-3">
        <q-select
          v-model="priority"
          outlined
          rounded
          dense
          clearable
          label="Priority"
          :options="priorities"
        />
      </div>
    </div>
    <q-card flat bordered class="q-mt-lg"
      ><q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :grid="$q.screen.lt.md"
        :pagination="{ rowsPerPage: 25 }"
        ><template #body-cell-title="p"
          ><q-td
            ><div class="text-weight-bold">{{ p.row.title }}</div>
            <div class="text-caption muted ellipsis" style="max-width: 220px">
              {{ p.row.description }}
            </div></q-td
          ></template
        ><template #body-cell-priority="p"
          ><q-td
            ><q-badge
              :color="
                p.row.priority === 'High'
                  ? 'negative'
                  : p.row.priority === 'Medium'
                    ? 'orange'
                    : 'positive'
              "
              :label="p.row.priority" /></q-td></template
        ><template #body-cell-status="p"
          ><q-td
            ><q-badge
              :color="
                p.row.status === 'Completed'
                  ? 'positive'
                  : p.row.status === 'In Progress'
                    ? 'primary'
                    : 'grey-6'
              "
              :label="p.row.status" /></q-td></template
        ><template #body-cell-progress="p"
          ><q-td style="min-width: 120px"
            ><q-linear-progress
              rounded
              size="8px"
              :value="p.row.progress / 100"
              color="primary"
            />
            <div class="text-caption q-mt-xs">{{ p.row.progress }}%</div></q-td
          ></template
        ><template #body-cell-due_date="p"
          ><q-td :class="overdue(p.row) ? 'text-negative text-weight-bold' : ''"
            >{{ p.row.due_date }}{{ overdue(p.row) ? " · Overdue" : "" }}</q-td
          ></template
        ><template #body-cell-actions="p"
          ><q-td
            ><q-btn
              flat
              round
              icon="visibility"
              @click="view(p.row.id)" /><q-btn
              v-if="isManager"
              flat
              round
              icon="edit"
              @click="edit(p.row)" /><q-btn
              v-if="isManager"
              flat
              round
              icon="delete"
              color="negative"
              @click="remove(p.row)" /></q-td></template></q-table></q-card
    ><q-dialog v-model="dialog"
      ><q-card style="min-width: min(520px, 92vw)"
        ><q-card-section class="text-h6"
          >{{ form.id ? "Edit" : "Create" }} Task</q-card-section
        ><q-card-section class="q-gutter-md"
          ><q-input v-model="form.title" outlined label="Task title" /><q-input
            v-model="form.description"
            outlined
            type="textarea"
            label="Description" /><q-select
            v-model="form.assigned_to"
            outlined
            emit-value
            map-options
            :options="team"
            option-value="id"
            :option-label="(x) => x.first_name + ' ' + x.last_name"
            label="Assign to" />
          <div class="row q-col-gutter-md">
            <div class="col">
              <q-select
                v-model="form.priority"
                outlined
                :options="priorities"
                label="Priority"
              />
            </div>
            <div class="col">
              <q-input
                v-model="form.due_date"
                outlined
                type="date"
                label="Due date"
              />
            </div></div></q-card-section
        ><q-card-section v-if="!form.id || selectedFiles.length" class="q-pt-none"
          ><div class="text-subtitle1">Attachments</div>
          <div class="text-caption muted q-mb-sm">
            Add documents or images related to this task. Maximum 10 MB per
            file.
          </div>
          <q-file
            v-model="selectedFiles"
            multiple
            outlined
            clearable
            use-chips
            accept="image/png,image/jpeg,image/webp,.pdf,.txt,.zip"
            max-file-size="10485760"
            @rejected="onFilesRejected"
            @update:model-value="validateFiles"
            label="Choose files" /><q-list
            v-if="selectedFiles.length"
            dense
            separator
            class="q-mt-sm"
            ><q-item v-for="file in selectedFiles" :key="fileKey(file)"
              ><q-item-section avatar
                ><q-icon
                  :name="
                    file.type.startsWith('image/') ? 'image' : 'attach_file'
                  "
                  color="primary" /></q-item-section
              ><q-item-section
                ><q-item-label>{{ file.name }}</q-item-label
                ><q-item-label caption>{{
                  formatBytes(file.size)
                }}</q-item-label></q-item-section
              ><q-item-section side
                ><q-btn
                  flat
                  round
                  dense
                  icon="close"
                  aria-label="Remove file"
                  @click="
                    removeFile(file)
                  " /></q-item-section></q-item></q-list></q-card-section
        ><q-card-actions align="right"
          ><q-btn flat label="Cancel" v-close-popup /><q-btn
            color="primary"
            label="Save Task"
            :loading="saving"
            @click="save" /></q-card-actions></q-card></q-dialog
  ></q-page>
</template>
<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { authStore } from "../stores/authStore";
import api from "../services/api";
const $q = useQuasar(),
  router = useRouter(),
  isManager = computed(() => authStore.user?.role === "manager"),
  rows = ref([]),
  team = ref([]),
  loading = ref(false),
  saving = ref(false),
  dialog = ref(false),
  search = ref(""),
  status = ref(null),
  priority = ref(null),
  labelId = ref(null),
  labels = ref([]),
  priorities = ["Low", "Medium", "High"],
  statuses = ["To Do", "In Progress", "Completed"],
  form = ref({});
const columns = [
  { name: "title", label: "Task", field: "title", align: "left" },
  { name: "assigned_name", label: "Assigned to", field: "assigned_name" },
  { name: "priority", label: "Priority", field: "priority" },
  { name: "status", label: "Status", field: "status" },
  { name: "progress", label: "Progress", field: "progress" },
  { name: "due_date", label: "Due date", field: "due_date" },
  { name: "actions", label: "", field: "actions" },
];
async function load() {
  loading.value = true;
  try {
    rows.value = (
      await api.get("/tasks", {
        params: {
          search: search.value,
          status: status.value,
          priority: priority.value,
          label_id: labelId.value,
        },
      })
    ).data.data;
  } finally {
    loading.value = false;
  }
}
async function open() {
  team.value = (await api.get("/employees/my-team")).data.data;
  form.value = {
    title: "",
    description: "",
    assigned_to: null,
    priority: "Medium",
    due_date: "",
  };
  selectedFiles.value = [];
  dialog.value = true;
}
async function edit(x) {
  await open();
  form.value = { ...x };
  dialog.value = true;
}
async function save() {
  saving.value = true;
  try {
    if (!form.value.title || !form.value.assigned_to || !form.value.due_date)
      throw new Error("Complete all required fields.");
    if (form.value.id) {
      await api.put(`/tasks/${form.value.id}`, form.value);
      if (selectedFiles.value.length) {
        const failed = await uploadFiles(form.value.id);
        selectedFiles.value = failed;
        if (failed.length) {
          $q.notify({ type: "negative", message: `${failed.length} attachment upload${failed.length === 1 ? "" : "s"} still failed. Retry again.` });
          return;
        }
        selectedFiles.value = [];
        dialog.value = false;
        $q.notify({ type: "positive", message: "Task and attachments saved" });
      } else {
        dialog.value = false;
        $q.notify({ type: "positive", message: "Task saved" });
      }
    } else {
      const response = await api.post("/tasks", form.value);
      const taskId = response.data.data.id;
      const failed = await uploadFiles(taskId);
      selectedFiles.value = failed;
      if (failed.length) {
        form.value.id = taskId;
        $q.notify({
          type: "negative",
          message: `Task created, but ${failed.length} attachment upload${failed.length === 1 ? "" : "s"} failed. Retry the remaining files.`,
        });
      } else {
        selectedFiles.value = [];
        dialog.value = false;
        $q.notify({ type: "positive", message: "Task and attachments saved" });
      }
    }
    load();
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.message || e.message,
    });
  } finally {
    saving.value = false;
  }
}
async function uploadFiles(taskId) {
  const failed = [];
  for (const file of selectedFiles.value) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api.post(`/tasks/${taskId}/attachments`, formData);
    } catch {
      failed.push(file);
    }
  }
  return failed;
}
const selectedFiles = ref([]);
const allowedFileTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/zip",
];
function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}
function formatBytes(size) {
  return size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function validateFiles(files) {
  const unique = [];
  const seen = new Set();
  for (const file of files || []) {
    if (!allowedFileTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      $q.notify({
        type: "negative",
        message: `${file.name} is not an approved file or exceeds 10 MB.`,
      });
      continue;
    }
    if (!seen.has(fileKey(file))) {
      seen.add(fileKey(file));
      unique.push(file);
    }
  }
  selectedFiles.value = unique;
}
function onFilesRejected() {
  $q.notify({
    type: "negative",
    message: "Only approved files up to 10 MB are allowed.",
  });
}
function removeFile(file) {
  selectedFiles.value = selectedFiles.value.filter(
    (item) => fileKey(item) !== fileKey(file),
  );
}
async function remove(x) {
  if (!confirm(`Delete ${x.title}?`)) return;
  try {
    await api.delete(`/tasks/${x.id}`);
    load();
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.message || "Unable to delete",
    });
  }
}
function overdue(x) {
  return (
    x.due_date < new Date().toISOString().slice(0, 10) &&
    x.status !== "Completed"
  );
}
function view(id) {
  router.push(`/tasks/${id}`);
}
watch([search, status, priority, labelId], load);
onMounted(async () => { labels.value = (await api.get('/labels')).data.data; load(); });
</script>

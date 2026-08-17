<template>
  <q-page class="q-pa-lg" v-if="task"
    ><q-btn flat icon="arrow_back" label="Back" @click="router.back()" /><q-card
      flat
      bordered
      class="q-mt-md q-pa-lg"
      ><div class="page-title">{{ task.title }}</div>
      <p class="muted">{{ task.description || "No description provided." }}</p>
      <div class="row q-col-gutter-lg">
        <div class="col-6 col-md-3">
          <b>Assigned to</b>
          <div>{{ task.assigned_name }}</div>
        </div>
        <div class="col-6 col-md-3">
          <b>Created by</b>
          <div>{{ task.creator_name }}</div>
        </div>
        <div class="col-6 col-md-3">
          <b>Priority</b>
          <div>{{ task.priority }}</div>
        </div>
        <div class="col-6 col-md-3">
          <b>Due date</b>
          <div>{{ task.due_date }}</div>
        </div>
      </div>
      <div class="q-mt-lg">
        <b>Status: </b>{{ task.status }} · {{ task.progress }}%
      </div>
      <q-linear-progress
        class="q-mt-sm"
        rounded
        size="10px"
        :value="task.progress / 100"
        color="primary" /></q-card
    ><div class="row q-gutter-sm q-mt-md"><q-badge v-for="label in labels" :key="label.id" color="indigo" :label="label.name" /></div
    ><q-card
      v-if="authStore.user?.role === 'employee'"
      flat
      bordered
      class="q-mt-lg q-pa-lg"
      ><div class="text-h6">Update progress</div>
      <q-select
        v-model="update.status"
        :options="statuses"
        outlined
        class="q-mt-md"
        label="Status"
        @update:model-value="normalizeProgress" /><q-slider
        v-model="update.progress"
        :min="progressBounds.min"
        :max="progressBounds.max"
        label
        class="q-mt-lg" /><q-btn
        color="primary"
        label="Save update"
        :loading="saving"
        @click="save" /></q-card
    ><q-card flat bordered class="q-mt-lg q-pa-lg"
      ><div class="text-h6">Activity History</div>
      <div v-if="activityLoading" class="text-center q-pa-lg"><q-spinner color="primary" size="30px" /></div>
      <div v-else-if="activityError" class="text-negative q-mt-md">{{ activityError }}</div>
      <q-list v-else-if="activities.length" separator class="q-mt-md"
        ><q-item v-for="item in activities" :key="item.id" class="q-py-md"
          ><q-item-section avatar><q-avatar color="indigo-1" text-color="primary"><img v-if="item.actor_avatar" :src="item.actor_avatar" alt="" /><span v-else>{{ initials(item.actor_name) }}</span></q-avatar></q-item-section
          ><q-item-section><q-item-label class="text-weight-bold">{{ activityTitle(item) }}</q-item-label><q-item-label caption>{{ activityDescription(item) }}</q-item-label><q-item-label caption class="text-caption">{{ item.actor_name || "System" }} · {{ formatActivityDate(item.created_at) }}</q-item-label></q-item-section
        ></q-item></q-list
      ><div v-else class="text-center q-pa-lg muted"><q-icon name="history" size="40px" color="indigo-3" /><div class="q-mt-sm">No activity recorded yet.</div></div></q-card
    ><q-card v-if="authStore.user?.role !== 'employee'" flat bordered class="q-mt-lg q-pa-lg"><div class="text-h6">Task labels</div><div class="row q-gutter-sm q-mt-md"><q-select v-model="selectedLabel" outlined dense options-dense label="Add label" :options="availableLabels" option-label="name" option-value="id" emit-value map-options class="col-12 col-sm-6" @update:model-value="assignLabel" /><q-input v-model="newLabel" outlined dense label="New label" class="col-12 col-sm-4" /><q-btn flat color="primary" label="Create" :disable="!newLabel.trim()" @click="createLabel" /></div></q-card
    ><q-card flat bordered class="q-mt-lg q-pa-lg"><div class="row items-center"><div><div class="text-h6">Subtasks</div><div class="muted">Break this work into smaller deliverables.</div></div><q-space /><div class="text-caption muted">{{ completedSubtasks }}/{{ subtasks.length }} complete</div></div><q-form @submit.prevent="addSubtask" class="row q-col-gutter-sm q-mt-md"><q-input v-model="subtaskTitle" outlined dense label="Subtask title" class="col" /><q-btn color="primary" unelevated label="Add" type="submit" :disable="!subtaskTitle.trim()" /></q-form><q-list v-if="subtasks.length" separator class="q-mt-md"><q-item v-for="subtask in subtasks" :key="subtask.id"><q-item-section avatar><q-checkbox :model-value="!!subtask.is_completed" @update:model-value="toggleSubtask(subtask, $event)" /></q-item-section><q-item-section><q-item-label :class="subtask.is_completed ? 'text-strike muted' : ''">{{ subtask.title }}</q-item-label></q-item-section><q-item-section v-if="authStore.user?.role !== 'employee'" side><q-btn flat round dense icon="delete" color="negative" @click="deleteSubtask(subtask)" /></q-item-section></q-item></q-list><div v-else class="muted q-mt-md">No subtasks have been added.</div></q-card
    ><div class="row q-col-gutter-lg q-mt-lg"
      ><div class="col-12 col-lg-7"><q-card flat bordered class="q-pa-lg"><div class="text-h6">Comments</div><q-form @submit.prevent="addComment" class="q-mt-md"><q-input v-model="commentBody" outlined type="textarea" autogrow maxlength="2000" counter label="Add a comment" :disable="commentSaving" /><q-btn class="q-mt-sm" color="primary" unelevated label="Post comment" type="submit" :loading="commentSaving" /></q-form><q-separator class="q-my-md" /><q-list v-if="comments.length" separator><q-item v-for="comment in comments" :key="comment.id" class="q-py-md"><q-item-section avatar><q-avatar color="indigo-1" text-color="primary">{{ initials(comment.author_name) }}</q-avatar></q-item-section><q-item-section><q-item-label class="text-weight-bold">{{ comment.author_name || "User" }}</q-item-label><q-item-label class="q-mt-xs" style="white-space: pre-wrap">{{ comment.body }}</q-item-label><q-item-label caption>{{ formatActivityDate(comment.created_at) }}</q-item-label></q-item-section></q-item></q-list><div v-else class="muted q-py-md">No comments yet.</div></q-card></div>
      ><div class="col-12 col-lg-5"><q-card flat bordered class="q-pa-lg"><div class="text-h6">Blockers</div><q-form @submit.prevent="addBlocker" class="q-mt-md"><q-input v-model="blockerDescription" outlined type="textarea" autogrow maxlength="2000" label="Report a blocker" :disable="blockerSaving" /><q-btn class="q-mt-sm" color="warning" text-color="dark" unelevated label="Report blocker" type="submit" :loading="blockerSaving" /></q-form><q-separator class="q-my-md" /><q-list v-if="blockers.length" separator><q-item v-for="blocker in blockers" :key="blocker.id"><q-item-section><q-item-label>{{ blocker.description }}</q-item-label><q-item-label caption>{{ blocker.reporter_name || "User" }} · {{ formatActivityDate(blocker.created_at) }}</q-item-label></q-item-section><q-item-section side><q-badge :color="blocker.status === 'RESOLVED' ? 'positive' : 'warning'" :label="blocker.status" /><q-btn v-if="blocker.status === 'OPEN'" flat dense color="positive" label="Resolve" @click="resolveBlocker(blocker)" /></q-item-section></q-item></q-list><div v-else class="muted q-py-md">No blockers reported.</div></q-card></div></div>
    ><q-card flat bordered class="q-mt-lg q-pa-lg"><div class="row items-center"><div><div class="text-h6">Attachments</div><div class="muted">Upload task documents or images up to 10 MB.</div></div><q-space /><q-file v-model="attachmentFile" outlined dense clearable accept="image/png,image/jpeg,image/webp,.pdf,.txt,.zip" max-file-size="10485760" @rejected="$q.notify({ type: 'negative', message: 'Only approved files up to 10 MB are allowed.' })" label="Choose file" style="max-width: 260px" /></div><q-btn class="q-mt-md" color="primary" unelevated label="Upload attachment" :disable="!attachmentFile" :loading="attachmentSaving" @click="uploadAttachment" /><q-separator class="q-my-md" /><q-list v-if="attachments.length" separator><q-item v-for="attachment in attachments" :key="attachment.id"><q-item-section avatar><q-icon :name="attachment.mime_type.startsWith('image/') ? 'image' : 'attach_file'" color="primary" size="28px" /></q-item-section><q-item-section><q-item-label>{{ attachment.original_name }}</q-item-label><q-item-label caption>{{ formatBytes(attachment.size_bytes) }} · {{ attachment.uploader_name || "User" }} · {{ formatActivityDate(attachment.created_at) }}</q-item-label></q-item-section><q-item-section side><q-btn flat dense color="primary" label="Download" @click="downloadAttachment(attachment)" /><q-btn v-if="attachment.uploaded_by_user_id === authStore.user?.id || ['admin','manager'].includes(authStore.user?.role)" flat round dense icon="delete" color="negative" aria-label="Delete attachment" @click="deleteAttachment(attachment)" /></q-item-section></q-item></q-list><div v-else class="muted q-py-md">No attachments yet.</div></q-card
  ></q-page>
</template>
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { authStore } from "../stores/authStore";
import api from "../services/api";
const route = useRoute(),
  router = useRouter(),
  $q = useQuasar(),
  task = ref(null),
  saving = ref(false),
  activities = ref([]),
  activityLoading = ref(false),
  activityError = ref(""),
  labels = ref([]),
  availableLabels = ref([]),
  selectedLabel = ref(null),
  newLabel = ref(""),
  subtasks = ref([]),
  subtaskTitle = ref(""),
  comments = ref([]),
  blockers = ref([]),
  attachments = ref([]),
  commentBody = ref(""),
  blockerDescription = ref(""),
  attachmentFile = ref(null),
  commentSaving = ref(false),
  blockerSaving = ref(false),
  attachmentSaving = ref(false),
  update = ref({ status: "To Do", progress: 0 }),
  statuses = ["To Do", "In Progress", "Completed"],
  progressBounds = computed(() =>
    update.value.status === "Completed"
      ? { min: 100, max: 100 }
      : update.value.status === "In Progress"
        ? { min: 1, max: 99 }
        : { min: 0, max: 0 },
  );
onMounted(async () => {
  try {
    task.value = (await api.get(`/tasks/${route.params.id}`)).data.data;
    update.value = { status: task.value.status, progress: task.value.progress };
    activityLoading.value = true;
    activities.value = (await api.get(`/tasks/${route.params.id}/activity`)).data.data;
    await loadCollaboration();
  } catch (error) {
    if (task.value) activityError.value = error.response?.data?.message || "Unable to load activity history.";
    else router.push("/");
  } finally {
    activityLoading.value = false;
  }
});
function initials(name) { return (name || "System").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function activityTitle(item) { return ({ TASK_CREATED: "Task Created", TASK_ASSIGNED: "Task Assigned", TASK_REASSIGNED: "Task Reassigned", STATUS_CHANGED: "Status Changed", PROGRESS_CHANGED: "Progress Changed", PRIORITY_CHANGED: "Priority Changed", DUE_DATE_CHANGED: "Due Date Changed", DETAILS_UPDATED: "Task Details Updated", TASK_COMPLETED: "Task Completed", COMMENT_ADDED: "Comment Added", BLOCKER_REPORTED: "Blocker Reported", BLOCKER_RESOLVED: "Blocker Resolved", BLOCKER_REOPENED: "Blocker Reopened", ATTACHMENT_ADDED: "Attachment Added", ATTACHMENT_REMOVED: "Attachment Removed", LABEL_ADDED: "Label Added", LABEL_REMOVED: "Label Removed", SUBTASK_CREATED: "Subtask Created", SUBTASK_COMPLETED: "Subtask Completed", SUBTASK_REOPENED: "Subtask Reopened", SUBTASK_DELETED: "Subtask Deleted" })[item.activity_type] || "Task Activity"; }
function activityDescription(item) { if (item.activity_type === "STATUS_CHANGED") return `${item.old_value} -> ${item.new_value}`; if (item.activity_type === "PROGRESS_CHANGED") return `${item.old_value}% -> ${item.new_value}%`; if (item.activity_type === "PRIORITY_CHANGED" || item.activity_type === "DUE_DATE_CHANGED") return `${item.old_value} -> ${item.new_value}`; if (item.activity_type === "TASK_CREATED") return "Created this task"; if (item.activity_type === "TASK_ASSIGNED") return `Assigned employee ID ${item.new_value}`; if (item.activity_type === "TASK_REASSIGNED") return `Employee ID ${item.old_value} -> ${item.new_value}`; if (item.activity_type === "TASK_COMPLETED") return "Marked this task as completed"; if (item.activity_type === "COMMENT_ADDED") return "Added a comment"; if (item.activity_type === "BLOCKER_REPORTED") return "Reported a blocker"; if (item.activity_type === "BLOCKER_RESOLVED") return "Resolved a blocker"; if (item.activity_type === "BLOCKER_REOPENED") return "Reopened a blocker"; if (item.activity_type === "ATTACHMENT_ADDED") return "Uploaded an attachment"; if (item.activity_type === "ATTACHMENT_REMOVED") return "Removed an attachment"; return item.old_value === "title" ? "Updated the task title" : "Updated task details"; }
function formatActivityDate(value) { return new Date(value.replace(" ", "T") + "Z").toLocaleString(); }
function formatBytes(value) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / (1024 * 1024)).toFixed(1)} MB`; }
async function loadCollaboration() { const id = route.params.id; const [commentResponse, blockerResponse, attachmentResponse, labelResponse, allLabelResponse, subtaskResponse] = await Promise.all([api.get(`/tasks/${id}/comments`), api.get(`/tasks/${id}/blockers`), api.get(`/tasks/${id}/attachments`), api.get(`/tasks/${id}/labels`), api.get('/labels'), api.get(`/tasks/${id}/subtasks`)]); comments.value = commentResponse.data.data; blockers.value = blockerResponse.data.data; attachments.value = attachmentResponse.data.data; labels.value = labelResponse.data.data; availableLabels.value = allLabelResponse.data.data; subtasks.value = subtaskResponse.data.data; }
const completedSubtasks = computed(() => subtasks.value.filter((item) => item.is_completed).length)
async function createLabel() { try { const response = await api.post('/labels', { name: newLabel.value }); newLabel.value = ''; availableLabels.value.push(response.data.data); selectedLabel.value = response.data.data.id; await assignLabel(response.data.data.id) } catch (error) { $q.notify({ type: 'negative', message: error.response?.data?.message || 'Unable to create label' }) } }
async function assignLabel(labelId) { if (!labelId) return; try { labels.value = (await api.post(`/tasks/${task.value.id}/labels/${labelId}`)).data.data; selectedLabel.value = null; await refreshHistory() } catch (error) { $q.notify({ type: 'negative', message: error.response?.data?.message || 'Unable to assign label' }) } }
async function addSubtask() { try { await api.post(`/tasks/${task.value.id}/subtasks`, { title: subtaskTitle.value }); subtaskTitle.value = ''; await refreshHistory() } catch (error) { $q.notify({ type: 'negative', message: error.response?.data?.message || 'Unable to add subtask' }) } }
async function toggleSubtask(subtask, value) { try { const response = await api.patch(`/tasks/${task.value.id}/subtasks/${subtask.id}`, { is_completed: value }); Object.assign(subtask, response.data.data); await refreshHistory() } catch (error) { $q.notify({ type: 'negative', message: error.response?.data?.message || 'Unable to update subtask' }) } }
async function deleteSubtask(subtask) { try { await api.delete(`/tasks/${task.value.id}/subtasks/${subtask.id}`); subtasks.value = subtasks.value.filter((item) => item.id !== subtask.id); await refreshHistory() } catch (error) { $q.notify({ type: 'negative', message: error.response?.data?.message || 'Unable to delete subtask' }) } }
async function refreshHistory() { activities.value = (await api.get(`/tasks/${route.params.id}/activity`)).data.data; await loadCollaboration(); }
async function addComment() { if (!commentBody.value.trim()) return; commentSaving.value = true; try { await api.post(`/tasks/${task.value.id}/comments`, { body: commentBody.value }); commentBody.value = ""; await refreshHistory(); $q.notify({ type: "positive", message: "Comment added" }); } catch (error) { $q.notify({ type: "negative", message: error.response?.data?.message || "Unable to add comment" }); } finally { commentSaving.value = false; } }
async function addBlocker() { if (!blockerDescription.value.trim()) return; blockerSaving.value = true; try { await api.post(`/tasks/${task.value.id}/blockers`, { description: blockerDescription.value }); blockerDescription.value = ""; await refreshHistory(); $q.notify({ type: "positive", message: "Blocker reported" }); } catch (error) { $q.notify({ type: "negative", message: error.response?.data?.message || "Unable to report blocker" }); } finally { blockerSaving.value = false; } }
async function resolveBlocker(blocker) { try { await api.patch(`/tasks/${task.value.id}/blockers/${blocker.id}`, { status: "RESOLVED" }); await refreshHistory(); $q.notify({ type: "positive", message: "Blocker resolved" }); } catch (error) { $q.notify({ type: "negative", message: error.response?.data?.message || "Unable to resolve blocker" }); } }
async function uploadAttachment() { if (!attachmentFile.value) return; attachmentSaving.value = true; try { const formData = new FormData(); formData.append("file", attachmentFile.value); await api.post(`/tasks/${task.value.id}/attachments`, formData); attachmentFile.value = null; await refreshHistory(); $q.notify({ type: "positive", message: "Attachment uploaded" }); } catch (error) { $q.notify({ type: "negative", message: error.response?.data?.message || "Unable to upload attachment" }); } finally { attachmentSaving.value = false; } }
async function downloadAttachment(attachment) { try { const response = await api.get(`/tasks/${task.value.id}/attachments/${attachment.id}`, { responseType: "blob" }); const url = URL.createObjectURL(response.data); const link = document.createElement("a"); link.href = url; link.download = attachment.original_name; link.click(); URL.revokeObjectURL(url); } catch (error) { $q.notify({ type: "negative", message: error.response?.data?.message || "Unable to download attachment" }); } }
async function deleteAttachment(attachment) { if (!confirm(`Delete ${attachment.original_name}?`)) return; try { await api.delete(`/tasks/${task.value.id}/attachments/${attachment.id}`); await refreshHistory(); $q.notify({ type: "positive", message: "Attachment deleted" }) } catch (error) { $q.notify({ type: "negative", message: error.response?.data?.message || "Unable to delete attachment" }) } }
function normalizeProgress(status) {
  update.value.progress =
    status === "Completed"
      ? 100
      : status === "To Do"
        ? 0
        : Math.min(99, Math.max(1, update.value.progress));
}
async function save() {
  saving.value = true;
  try {
    const r = await api.patch(`/tasks/${task.value.id}/progress`, update.value);
    task.value = r.data.data;
    update.value = { status: task.value.status, progress: task.value.progress };
    await refreshHistory();
    $q.notify({ type: "positive", message: "Progress updated" });
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.message || "Unable to update",
    });
  } finally {
    saving.value = false;
  }
}
</script>

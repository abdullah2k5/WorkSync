<template>
  <q-page class="q-pa-lg">
    <div class="text-overline text-primary">ACCOUNT</div>
    <div class="page-title">My Profile</div>
    <p class="muted">Manage your personal information and account security.</p>

    <div class="row q-col-gutter-lg q-mt-lg">
      <div class="col-12 col-lg-7">
        <q-card flat bordered>
          <q-card-section class="row items-center q-gutter-md">
            <q-avatar size="88px" color="indigo-1" text-color="primary">
              <img v-if="form.profile_picture" :src="form.profile_picture" alt="Profile avatar" />
              <span v-else class="text-h4">{{ initials }}</span>
            </q-avatar>
            <div>
              <div class="text-h6">{{ fullName || "Your profile" }}</div>
              <div class="muted">{{ profile?.user?.email }}</div>
              <q-btn flat dense color="primary" label="Choose picture" class="q-mt-sm" @click="fileInput?.click()" />
              <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="readPicture" />
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <q-form @submit.prevent="saveProfile" class="q-gutter-md">
              <div class="row q-col-gutter-md">
                <q-input v-model="form.first_name" class="col-12 col-sm-6" outlined label="First name" :disable="loading" />
                <q-input v-model="form.last_name" class="col-12 col-sm-6" outlined label="Last name" :disable="loading" />
              </div>
              <q-input :model-value="profile?.user?.email || ''" outlined label="Email" readonly />
              <div class="row q-col-gutter-md">
                <q-input :model-value="roleLabel" class="col-12 col-sm-6" outlined label="Role" readonly />
                <q-input v-model="form.phone" class="col-12 col-sm-6" outlined label="Phone number" :disable="loading" />
              </div>
              <div class="row q-col-gutter-md text-body2 muted">
                <div class="col-12 col-sm-6">Department: {{ profile?.employee?.department_name || "Not assigned" }}</div>
                <div class="col-12 col-sm-6">Employee ID: {{ profile?.employee?.employee_id || "Not assigned" }}</div>
              </div>
              <q-btn color="primary" unelevated label="Save profile" type="submit" :loading="loading" />
            </q-form>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-lg-5">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-h6">Account security</div>
            <div class="muted q-mt-xs">Keep your WorkSync account protected with a password only you know.</div>
          </q-card-section>
          <q-card-actions><q-btn color="primary" unelevated label="Change password" @click="openPasswordDialog" /></q-card-actions>
        </q-card>
        <q-card flat bordered class="q-mt-lg">
          <q-card-section><div class="text-h6">Notification preferences</div><div class="muted q-mt-xs">Choose which WorkSync updates appear in your notifications.</div></q-card-section>
          <q-card-section v-if="preferencesLoading" class="text-center"><q-spinner color="primary" /></q-card-section>
          <q-card-section v-else-if="preferencesError" class="text-negative">{{ preferencesError }}</q-card-section>
          <q-card-section v-else class="q-gutter-sm">
            <div v-for="item in preferenceItems" :key="item.key" class="row items-center"><div><div class="text-body2">{{ item.label }}</div><div class="text-caption muted">{{ item.description }}</div></div><q-space /><q-toggle v-model="preferences[item.key]" color="primary" :disable="preferencesSaving" @update:model-value="savePreference(item.key, $event)" /></div>
            <q-btn flat color="primary" icon="restart_alt" label="Restore defaults" :loading="preferencesSaving" @click="resetPreferences" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-dialog v-model="passwordDialog" persistent @hide="clearPasswordState">
      <q-card style="width: 440px; max-width: 92vw">
        <q-card-section>
          <div class="text-h6">{{ passwordStep === 1 ? 'Verify Your Identity' : 'Create New Password' }}</div>
          <div v-if="passwordStep === 1" class="muted q-mt-sm">For security, please enter your current password to continue.</div>
        </q-card-section>
        <q-card-section>
          <q-form v-if="passwordStep === 1" @submit.prevent="verifyCurrentPassword">
            <q-input v-model="password.current_password" autofocus outlined label="Current Password" type="password" :error="!!passwordError" :error-message="passwordError" :disable="passwordLoading" />
            <q-card-actions align="right" class="q-px-none q-mt-md"><q-btn flat label="Cancel" @click="passwordDialog = false" /><q-btn color="primary" label="Continue" type="submit" :loading="passwordLoading" /></q-card-actions>
          </q-form>
          <q-form v-else @submit.prevent="updatePassword" class="q-gutter-md">
            <q-input v-model="password.new_password" autofocus outlined label="New Password" type="password" :disable="passwordLoading" />
            <q-input v-model="password.confirm_password" outlined label="Confirm New Password" type="password" :error="!!passwordError" :error-message="passwordError" :disable="passwordLoading" />
            <div class="text-caption muted">Minimum 8 characters.</div>
            <q-card-actions align="right" class="q-px-none"><q-btn flat label="Cancel" @click="passwordDialog = false" /><q-btn color="primary" label="Update Password" type="submit" :loading="passwordLoading" /></q-card-actions>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Notify } from 'quasar'
import api from '../services/api'
import { authStore, setAuth } from '../stores/authStore'

const profile = ref(null)
const loading = ref(false)
const passwordLoading = ref(false)
const passwordDialog = ref(false)
const passwordStep = ref(1)
const passwordError = ref('')
const verificationToken = ref('')
const fileInput = ref(null)
const form = ref({ first_name: '', last_name: '', phone: '', profile_picture: '' })
const password = ref({ current_password: '', new_password: '', confirm_password: '' })
const fullName = computed(() => `${form.value.first_name} ${form.value.last_name}`.trim())
const initials = computed(() => fullName.value.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?')
const roleLabel = computed(() => profile.value?.user?.role ? profile.value.user.role[0].toUpperCase() + profile.value.user.role.slice(1) : '')
const preferences = ref({})
const preferencesLoading = ref(false)
const preferencesSaving = ref(false)
const preferencesError = ref('')
const preferenceItems = [
  { key: 'task_assignment', label: 'Task assignments', description: 'When work is assigned or reassigned to you.' },
  { key: 'task_comment', label: 'Task comments', description: 'When someone comments on a task you participate in.' },
  { key: 'blocker_created', label: 'Blockers', description: 'When a blocker is reported on a task.' },
  { key: 'blocker_resolved', label: 'Blocker resolutions', description: 'When a reported blocker is resolved.' },
  { key: 'attachment', label: 'Attachments', description: 'When a task attachment is uploaded.' },
  { key: 'due_date_reminder', label: 'Due-date reminders', description: 'For upcoming and today-due tasks.' },
  { key: 'overdue_task', label: 'Overdue tasks', description: 'When an active task passes its due date.' },
  { key: 'leave_update', label: 'Leave updates', description: 'When leave requests are submitted or reviewed.' },
  { key: 'announcement', label: 'Announcements', description: 'For workplace announcements.' },
]

async function loadProfile() {
  const response = await api.get('/profile')
  profile.value = response.data.data
  const employee = profile.value.employee || {}
  form.value = { first_name: employee.first_name || '', last_name: employee.last_name || '', phone: employee.phone || '', profile_picture: employee.profile_picture || '' }
}

function readPicture(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    Notify.create({ type: 'negative', message: 'Profile picture must be under 2 MB.' })
    return
  }
  const reader = new FileReader()
  reader.onload = () => { form.value.profile_picture = reader.result }
  reader.readAsDataURL(file)
}

async function saveProfile() {
  loading.value = true
  try {
    const response = await api.put('/profile', form.value)
    profile.value = response.data.data
    setAuth({ token: authStore.token, user: profile.value.user })
    Notify.create({ type: 'positive', message: 'Profile updated.' })
  } catch (error) {
    Notify.create({ type: 'negative', message: error.response?.data?.message || 'Unable to update profile.' })
  } finally {
    loading.value = false
  }
}

function openPasswordDialog() {
  clearPasswordState()
  passwordDialog.value = true
}

function clearPasswordState() {
  password.value = { current_password: '', new_password: '', confirm_password: '' }
  verificationToken.value = ''
  passwordError.value = ''
  passwordStep.value = 1
}

async function verifyCurrentPassword() {
  passwordError.value = ''
  if (!password.value.current_password) {
    passwordError.value = 'Current password is required.'
    return
  }
  passwordLoading.value = true
  try {
    const response = await api.post('/profile/password/verify', { current_password: password.value.current_password })
    verificationToken.value = response.data.verification_token
    password.value.current_password = ''
    passwordStep.value = 2
  } catch (error) {
    passwordError.value = error.response?.data?.message || 'Incorrect current password. Please try again.'
  } finally {
    passwordLoading.value = false
  }
}

async function updatePassword() {
  passwordError.value = ''
  if (password.value.new_password.length < 8) {
    passwordError.value = 'New password must be at least 8 characters.'
    return
  }
  if (password.value.new_password !== password.value.confirm_password) {
    passwordError.value = 'New passwords do not match.'
    return
  }
  passwordLoading.value = true
  try {
    await api.put('/profile/password', { verification_token: verificationToken.value, new_password: password.value.new_password, confirm_password: password.value.confirm_password })
    passwordDialog.value = false
    Notify.create({ type: 'positive', message: 'Password changed successfully.' })
  } catch (error) {
    passwordError.value = error.response?.data?.message || 'Unable to change password.'
  } finally {
    passwordLoading.value = false
  }
}

onMounted(loadProfile)
onMounted(async () => { preferencesLoading.value = true; try { preferences.value = (await api.get('/profile/notification-preferences')).data.data } catch (error) { preferencesError.value = error.response?.data?.message || 'Unable to load notification preferences.' } finally { preferencesLoading.value = false } })

async function savePreference(key, value) { preferencesSaving.value = true; try { preferences.value = (await api.patch('/profile/notification-preferences', { [key]: value })).data.data; Notify.create({ type: 'positive', message: 'Notification preferences updated.' }) } catch (error) { preferences[key] = !value; Notify.create({ type: 'negative', message: error.response?.data?.message || 'Unable to update preferences.' }) } finally { preferencesSaving.value = false } }
async function resetPreferences() { preferencesSaving.value = true; try { preferences.value = (await api.post('/profile/notification-preferences/reset')).data.data; Notify.create({ type: 'positive', message: 'Notification preferences restored.' }) } catch (error) { Notify.create({ type: 'negative', message: error.response?.data?.message || 'Unable to restore preferences.' }) } finally { preferencesSaving.value = false } }
</script>

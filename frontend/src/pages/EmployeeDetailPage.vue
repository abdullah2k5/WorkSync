<template>
  <q-page class="q-pa-lg">
    <div v-if="loading" class="text-center q-pa-xl"><q-spinner color="primary" size="40px" /><div class="muted q-mt-md">Loading employee information...</div></div>
    <div v-else-if="error" class="text-center q-pa-xl"><q-icon name="person_off" size="52px" color="grey-5" /><div class="text-h6 q-mt-md">Unable to load employee</div><div class="muted q-mt-sm">{{ error }}</div><q-btn class="q-mt-lg" flat icon="arrow_back" label="Back to employees" @click="router.push('/admin/employees')" /></div>
    <template v-else-if="employee">
      <div class="row items-center q-mb-lg">
        <div><div class="text-overline text-primary">EMPLOYEE DIRECTORY</div><div class="page-title">Employee details</div><div class="muted">Review account and organizational information.</div></div>
        <q-space /><q-btn v-if="isAdmin" flat color="negative" icon="lock_reset" label="Reset password" :disable="employee.user_id === authStore.user?.id" @click="confirmReset = true" /><q-btn flat icon="arrow_back" label="Back to employees" @click="router.push('/admin/employees')" />
      </div>
      <q-card flat bordered class="q-pa-lg">
        <div class="row items-center q-gutter-md">
          <q-avatar size="88px" color="indigo-1" text-color="primary"><img v-if="employee.profile_picture" :src="employee.profile_picture" alt="Employee avatar" /><span v-else>{{ initials }}</span></q-avatar>
          <div><div class="text-h5 text-weight-bold">{{ employee.first_name }} {{ employee.last_name }}</div><div class="muted">{{ employee.email }}</div><q-badge class="q-mt-sm" :color="employee.is_active ? 'positive' : 'grey-6'" :label="employee.is_active ? 'Active' : 'Inactive'" /></div>
        </div>
        <q-separator class="q-my-lg" />
        <div class="row q-col-gutter-lg">
          <div v-for="field in fields" :key="field.label" class="col-12 col-sm-6 col-md-4"><div class="text-caption muted">{{ field.label }}</div><div class="text-body1 q-mt-xs">{{ field.value || 'Not provided' }}</div></div>
        </div>
      </q-card>
      <q-dialog v-model="confirmReset">
        <q-card class="q-pa-lg" style="width: min(480px, 92vw)">
          <div class="text-h6">Reset Employee Password</div>
          <div class="q-mt-md">You are about to generate a new temporary password for:</div>
          <div class="text-weight-bold q-mt-sm">{{ employee.first_name }} {{ employee.last_name }}</div>
          <div class="muted">{{ employee.email }}</div>
          <q-banner class="bg-orange-1 text-warning q-mt-lg">The employee will be required to change this password after their next login. Their previous password will stop working immediately.</q-banner>
          <div class="row justify-end q-gutter-sm q-mt-lg"><q-btn flat label="Cancel" :disable="resetting" v-close-popup /><q-btn color="negative" unelevated label="Reset password" :loading="resetting" @click="resetPassword" /></div>
        </q-card>
      </q-dialog>
      <q-dialog v-model="resultDialog" @hide="clearResetResult">
        <q-card v-if="passwordReset" class="q-pa-lg" style="width: min(520px, 92vw)">
          <div class="text-h6">Password Reset Successfully</div>
          <div class="q-mt-md text-weight-bold">{{ passwordReset.employee.name }}</div>
          <div class="muted">{{ passwordReset.employee.email }}</div>
          <q-input class="q-mt-lg" outlined readonly label="Temporary Password" :model-value="passwordReset.temporaryPassword"><template #append><q-btn flat round dense icon="content_copy" aria-label="Copy temporary password" @click="copyText(passwordReset.temporaryPassword, 'Temporary password copied.')" /></template></q-input>
          <div class="row q-gutter-sm q-mt-md"><q-btn flat icon="content_copy" label="Copy password" @click="copyText(passwordReset.temporaryPassword, 'Temporary password copied.')" /><q-btn flat icon="content_copy" label="Copy email" @click="copyText(passwordReset.employee.email, 'Email copied.')" /><q-btn flat icon="content_copy" label="Copy credentials" @click="copyText(`Email: ${passwordReset.employee.email}\nTemporary Password: ${passwordReset.temporaryPassword}`, 'Credentials copied.')" /></div>
          <q-banner class="bg-orange-1 text-warning q-mt-lg">This temporary password is shown only once. Save or securely share it with the employee before closing this dialog.</q-banner>
          <div class="row justify-end q-mt-lg"><q-btn color="primary" unelevated label="Done" @click="resultDialog = false" /></div>
        </q-card>
      </q-dialog>
    </template>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Notify } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import api from '../services/api'
import { authStore } from '../stores/authStore'

const route = useRoute()
const router = useRouter()
const employee = ref(null)
const loading = ref(true)
const error = ref('')
const confirmReset = ref(false)
const resultDialog = ref(false)
const resetting = ref(false)
const passwordReset = ref(null)
const isAdmin = computed(() => authStore.user?.role === 'admin')
const initials = computed(() => `${employee.value?.first_name?.[0] || ''}${employee.value?.last_name?.[0] || ''}`.toUpperCase())
const fields = computed(() => employee.value ? [
  { label: 'Role', value: employee.value.role },
  { label: 'Employee ID', value: employee.value.employee_id },
  { label: 'Department', value: employee.value.department_name },
  { label: 'Job position', value: employee.value.job_position },
  { label: 'Manager', value: employee.value.manager_name },
  { label: 'Joining date', value: employee.value.joining_date },
  { label: 'Phone', value: employee.value.phone },
] : [])

async function load() {
  loading.value = true
  error.value = ''
  try {
    employee.value = (await api.get(`/employees/${route.params.id}`)).data.data
  } catch (requestError) {
    error.value = requestError.response?.status === 404 ? 'The requested employee does not exist.' : requestError.response?.data?.message || 'Please try again.'
  } finally {
    loading.value = false
  }
}

async function resetPassword() {
  resetting.value = true
  try {
    passwordReset.value = (await api.post(`/employees/${employee.value.id}/reset-password`)).data
    confirmReset.value = false
    resultDialog.value = true
  } catch (requestError) {
    Notify.create({ type: 'negative', message: requestError.response?.data?.message || 'Unable to reset the employee password.' })
  } finally {
    resetting.value = false
  }
}

async function copyText(value, message) {
  try {
    await navigator.clipboard.writeText(value)
    Notify.create({ type: 'positive', message })
  } catch {
    Notify.create({ type: 'negative', message: 'Unable to copy to the clipboard.' })
  }
}

function clearResetResult() {
  passwordReset.value = null
}

onMounted(load)
</script>

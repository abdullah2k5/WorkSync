<template>
  <q-page class="q-pa-lg">
    <div class="row items-center q-mb-lg">
      <div>
        <div class="text-overline text-primary">ADMINISTRATION</div>
        <div class="page-title">Add employee</div>
        <div class="muted">Create an employee account and assign their organizational role.</div>
      </div>
      <q-space />
      <q-btn flat icon="arrow_back" label="Back to employees" @click="router.push('/admin/employees')" />
    </div>

    <q-card flat bordered class="employee-form-card">
      <q-form @submit.prevent="submit" class="q-pa-lg q-gutter-lg">
        <div class="text-subtitle1 text-weight-bold">Employee information</div>
        <div class="row q-col-gutter-md">
          <q-input v-model.trim="form.first_name" class="col-12 col-sm-6" outlined label="First name" :rules="[required('Enter a first name.') ]" />
          <q-input v-model.trim="form.last_name" class="col-12 col-sm-6" outlined label="Last name" :rules="[required('Enter a last name.') ]" />
          <q-input v-model.trim="form.email" class="col-12 col-sm-6" outlined type="email" label="Work email" :rules="[emailRule]" />
          <q-input v-model.trim="form.employee_id" class="col-12 col-sm-6" outlined label="Employee ID" :rules="[required('Enter an employee ID.') ]" />
          <q-input v-model="form.password" class="col-12 col-sm-6" outlined type="password" label="Temporary password" :rules="[passwordRule]" />
          <q-input v-model.trim="form.job_position" class="col-12 col-sm-6" outlined label="Job position" :rules="[required('Enter a job position.') ]" />
          <q-select v-model="form.role" class="col-12 col-sm-6" outlined label="Role" :options="roles" :rules="[required('Select a role.') ]" />
          <q-select v-model="form.department_id" class="col-12 col-sm-6" outlined emit-value map-options label="Department" :options="departments" option-value="id" option-label="name" clearable />
          <q-select v-model="form.manager_id" class="col-12 col-sm-6" outlined emit-value map-options label="Manager" :options="managers" option-value="id" :option-label="managerLabel" clearable />
          <q-input v-model="form.joining_date" class="col-12 col-sm-6" outlined type="date" label="Joining date" :rules="[required('Select a joining date.') ]" />
        </div>
        <q-separator />
        <div class="row justify-end q-gutter-sm">
          <q-btn flat label="Cancel" @click="router.push('/admin/employees')" />
          <q-btn color="primary" unelevated label="Create employee" type="submit" :loading="saving" />
        </div>
      </q-form>
    </q-card>
  </q-page>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Notify } from 'quasar'
import { useRouter } from 'vue-router'
import api from '../services/api'

const router = useRouter()
const saving = ref(false)
const departments = ref([])
const managers = ref([])
const roles = ['manager', 'employee']
const form = ref({ first_name: '', last_name: '', email: '', password: '', role: 'employee', employee_id: '', department_id: null, manager_id: null, job_position: '', joining_date: '' })
const required = (message) => (value) => !!value || message
const emailRule = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '') || 'Enter a valid work email address.'
const passwordRule = (value) => (value || '').length >= 8 || 'Temporary password must be at least 8 characters.'
const managerLabel = (manager) => `${manager.first_name} ${manager.last_name}`

async function loadOptions() {
  const [departmentResponse, managerResponse] = await Promise.all([api.get('/departments'), api.get('/employees/managers')])
  departments.value = departmentResponse.data.data
  managers.value = managerResponse.data.data
}

async function submit() {
  saving.value = true
  try {
    const response = await api.post('/employees', form.value)
    Notify.create({ type: 'positive', message: 'Employee created successfully.' })
    router.push(`/admin/employees/${response.data.data.id}`)
  } catch (error) {
    Notify.create({ type: 'negative', message: error.response?.data?.message || 'Unable to create employee.' })
  } finally {
    saving.value = false
  }
}

onMounted(loadOptions)
</script>

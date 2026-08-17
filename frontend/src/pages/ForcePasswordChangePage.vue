<template>
  <div class="login-shell row items-center justify-center q-pa-lg">
    <q-card flat bordered class="force-password-card q-pa-lg">
      <div class="login-card-icon"><q-icon name="lock_reset" size="22px" /></div>
      <div class="text-overline text-primary text-weight-bold">ACCOUNT SECURITY</div>
      <div class="text-h4 text-weight-bold q-mt-sm">Set Your New Password</div>
      <p class="muted q-mt-sm">For security reasons, you must update your temporary password before continuing to WorkSync.</p>
      <q-form @submit.prevent="submit" class="q-gutter-md q-mt-lg">
        <q-input v-model="currentPassword" outlined label="Current Temporary Password" type="password" autocomplete="current-password" :rules="[required('Enter your temporary password.')]" />
        <q-input v-model="newPassword" outlined label="New Password" :type="showNew ? 'text' : 'password'" autocomplete="new-password" :rules="[passwordRule]"><template #append><q-icon :name="showNew ? 'visibility_off' : 'visibility'" class="cursor-pointer" @click="showNew = !showNew" /></template></q-input>
        <q-input v-model="confirmPassword" outlined label="Confirm New Password" :type="showConfirm ? 'text' : 'password'" autocomplete="new-password" :rules="[matchRule]"><template #append><q-icon :name="showConfirm ? 'visibility_off' : 'visibility'" class="cursor-pointer" @click="showConfirm = !showConfirm" /></template></q-input>
        <div class="password-requirements text-caption muted">At least 8 characters, including uppercase, lowercase, and a number.</div>
        <q-banner v-if="error" dense rounded class="bg-red-1 text-negative">{{ error }}</q-banner>
        <q-btn type="submit" color="primary" unelevated class="full-width q-py-sm" label="Update password" :loading="loading" />
      </q-form>
    </q-card>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'
import { authStore, setAuth } from '../stores/authStore'
const router = useRouter(), currentPassword = ref(''), newPassword = ref(''), confirmPassword = ref(''), showNew = ref(false), showConfirm = ref(false), loading = ref(false), error = ref('')
const required = (message) => (value) => !!value || message
const passwordRule = (value) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(value || '') || 'Use at least 8 characters with uppercase, lowercase, and a number.'
const matchRule = (value) => value === newPassword.value || 'Passwords do not match.'
async function submit() { error.value = ''; if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword.value) || newPassword.value !== confirmPassword.value) return; loading.value = true; try { const response = await api.post('/auth/change-password', { currentPassword: currentPassword.value, newPassword: newPassword.value, confirmPassword: confirmPassword.value }); setAuth({ token: response.data.token, user: response.data.user }); await router.replace(`/${authStore.user.role}/dashboard`) } catch (requestError) { error.value = requestError.response?.data?.message || 'Unable to update your password.' } finally { loading.value = false } }
</script>

<template>
  <div class="login-shell row">
    <section class="brand-panel col-6 flex flex-center q-pa-xl">
      <div class="brand-inner">
        <div class="row items-center brand-lockup">
          <div class="brand-mark">W</div>
          <div class="text-h5 text-weight-bold q-ml-md">WorkSync</div>
        </div>
        <div class="text-h2 text-weight-bold q-mt-xl brand-heading">
          Your team's<br />work, in focus.
        </div>
        <p
          class="text-subtitle1 text-indigo-1 q-mt-lg"
          style="max-width: 450px"
        >
          Access a focused workspace for tasks, collaboration, approvals, and
          the activity that keeps work moving.
        </p>
        <div class="login-capabilities q-mt-xl">
          <div class="row items-center q-mb-lg"><q-icon name="task_alt" size="22px" color="indigo-2" /><span class="q-ml-md">Centralized task management</span></div>
          <div class="row items-center q-mb-lg"><q-icon name="groups" size="22px" color="indigo-2" /><span class="q-ml-md">Clear team collaboration</span></div>
          <div class="row items-center"><q-icon name="notifications_active" size="22px" color="indigo-2" /><span class="q-ml-md">Real-time operational updates</span></div>
        </div>
      </div>
    </section>
    <main class="col-6 flex flex-center q-pa-xl login-main">
      <div class="login-form login-card">
        <div class="login-card-icon"><q-icon name="lock_outline" size="22px" /></div>
        <div class="text-overline text-primary text-weight-bold">
          WORKSPACE ACCESS
        </div>
        <div class="text-h3 text-weight-bold q-mt-sm">Welcome back</div>
        <div class="muted q-mt-sm">Sign in to continue to your workspace.</div>
        <q-form @submit="submit" class="q-mt-xl"
          ><q-input
            v-model.trim="email"
            type="email"
            label="Email address"
            outlined
            class="q-mb-md"
            autocomplete="username"
            :rules="[(v) => !!v || 'Enter your work email address.']"
            ><template #prepend
              ><q-icon name="mail_outline" /></template></q-input
          ><q-input
            v-model="password"
            :type="show ? 'text' : 'password'"
            label="Password"
            outlined
            autocomplete="current-password"
            :rules="[(v) => !!v || 'Enter your password.']"
            ><template #prepend><q-icon name="lock_outline" /></template
            ><template #append
              ><q-icon
                :name="show ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="show = !show" /></template
          ></q-input>
          <div class="text-caption muted q-mt-md">Use your WorkSync account credentials to continue.</div>
          <q-banner
            v-if="error"
            dense
            rounded
            class="bg-red-1 text-negative q-mt-md"
            >{{ error }}</q-banner
          ><q-btn
            type="submit"
            label="Sign in"
            color="primary"
            unelevated
            rounded
            class="full-width q-mt-lg q-py-sm login-submit"
            :loading="loading"
          />
          <div class="text-center muted q-mt-xl">
            <q-icon name="verified_user" color="positive" class="q-mr-xs" />
            Secure access to your workspace
          </div></q-form
        >
      </div>
    </main>
  </div>
</template>
<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { login } from "../services/authService";
import { setAuth } from "../stores/authStore";
const email = ref(""),
  password = ref(""),
  error = ref(""),
  loading = ref(false),
  show = ref(false);
const router = useRouter(),
  route = useRoute();
async function submit() {
  error.value = "";
  loading.value = true;
  try {
    const data = await login({ email: email.value, password: password.value });
    setAuth(data);
    await router.push(route.query.redirect || `/${data.user.role}/dashboard`);
  } catch (err) {
    error.value =
      err.response?.data?.message || "Unable to sign in. Please try again.";
  } finally {
    loading.value = false;
  }
}
</script>

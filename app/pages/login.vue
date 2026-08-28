<script setup lang="ts">
import { z } from 'zod'
import type { LoginRequest } from '~/types/auth'
import { getErrorMessage } from '~/shared/utils/errors'

definePageMeta({ layout: false })

const auth = useAuth()
const router = useRouter()
const toast = useToast()
const remember = ref(false)
const { t } = useI18n()

const schema = z.object({
  email: z.string().min(1, 'Email or username is required'),
  password: z.string().min(6, 'Password must be at least 6 characters')
})

const state = reactive({
  email: '',
  password: ''
})

function loadSaved() {
  if (import.meta.client) {
    const saved = localStorage.getItem('remembered_login')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        state.email = data.username || ''
        state.password = data.password || ''
        remember.value = true
      } catch (e) {
        void e
      }
    }
  }
}

function saveCredentials() {
  if (remember.value) {
    localStorage.setItem('remembered_login', JSON.stringify({ username: state.email, password: state.password }))
  } else {
    localStorage.removeItem('remembered_login')
  }
}

onMounted(loadSaved)

async function onSubmit() {
  try {
    const input: LoginRequest = state.email.includes('@')
      ? { email: state.email, password: state.password }
      : { username: state.email, password: state.password }
    await auth.login(input)
    saveCredentials()
    await router.push('/')
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
    <UCard class="w-full max-w-md">
      <template #header>
        <div class="text-center">
          <h1 class="text-2xl font-bold">
            {{ $t('auth.welcomeBack') }}
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {{ $t('auth.signInToAccount') }}
          </p>
        </div>
      </template>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField :label="$t('auth.emailOrUsername')" name="email">
          <UInput v-model="state.email" type="text" :placeholder="$t('auth.emailPlaceholder')" class="w-full" />
        </UFormField>

        <UFormField :label="$t('auth.password')" name="password">
          <BasePasswordInput v-model="state.password" :placeholder="$t('auth.passwordPlaceholder')" class="w-full" />
        </UFormField>

        <UCheckbox v-model="remember" :label="$t('auth.rememberMe')" />

        <UButton type="submit" variant="soft" block :loading="auth.loading.value" :disabled="auth.loading.value">
          {{ $t('auth.signIn') }}
        </UButton>
      </UForm>

      <!-- <template #footer>
        <p class="text-center text-sm text-gray-500">
          {{ $t('auth.noAccount') }}
          <NuxtLink to="/register" class="text-primary font-medium">{{ $t('auth.signUp') }}</NuxtLink>
        </p>
      </template> -->
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ middleware: 'root' })

const { t } = useI18n()
const toast = useToast()
const saving = ref(false)
const loading = ref(true)

type ConfigKeys = 'MONGODB_URI' | 'MONGODB_DB_NAME' | 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY' | 'SUPABASE_SERVICE_ROLE_KEY' | 'CLOUDINARY_CLOUD_NAME' | 'CLOUDINARY_API_KEY' | 'CLOUDINARY_API_SECRET' | 'FIREBASE_PROJECT_ID' | 'FIREBASE_CLIENT_EMAIL' | 'FIREBASE_PRIVATE_KEY' | 'FIREBASE_STORAGE_BUCKET' | 'WEB_PUSH_PUBLIC_KEY' | 'WEB_PUSH_PRIVATE_KEY' | 'WEB_PUSH_SUBJECT' | 'APP_NAME' | 'APP_URL' | 'APP_PORT' | 'TOOLS_YTDLP_PATH' | 'TOOLS_FFMPEG_PATH' | 'TOOLS_FFPROBE_PATH' | 'AI_PROVIDER' | 'AI_API_KEY' | 'AI_BASE_URL' | 'AI_MODEL'

const config = reactive<Record<ConfigKeys, string>>({
  MONGODB_URI: '',
  MONGODB_DB_NAME: '',
  SUPABASE_URL: '',
  SUPABASE_PUBLISHABLE_KEY: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  FIREBASE_PROJECT_ID: '',
  FIREBASE_CLIENT_EMAIL: '',
  FIREBASE_PRIVATE_KEY: '',
  FIREBASE_STORAGE_BUCKET: '',
  WEB_PUSH_PUBLIC_KEY: '',
  WEB_PUSH_PRIVATE_KEY: '',
  WEB_PUSH_SUBJECT: '',
  APP_NAME: '',
  APP_URL: '',
  APP_PORT: '',
  TOOLS_YTDLP_PATH: '',
  TOOLS_FFMPEG_PATH: '',
  TOOLS_FFPROBE_PATH: '',
  AI_PROVIDER: '',
  AI_API_KEY: '',
  AI_BASE_URL: '',
  AI_MODEL: ''
})

const hasElectron = computed(() => !!window.electronAPI)
const showFirebaseKey = ref(false)

const schema = computed(() => z.object({
  MONGODB_URI: z.string().refine(v => !v || v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'), t('settings.invalidMongoUri')),
  MONGODB_DB_NAME: z.string().optional(),
  SUPABASE_URL: z.string().refine(v => !v || /^https?:\/\//.test(v), t('settings.invalidUrl')).optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_SUBJECT: z.string().optional(),
  APP_NAME: z.string().optional(),
  APP_URL: z.string().refine(v => !v || /^https?:\/\//.test(v), t('settings.invalidUrl')).optional(),
  APP_PORT: z.string().refine(v => !v || (parseInt(v, 10) > 0 && parseInt(v, 10) < 65536), t('settings.invalidPort')).optional(),
  TOOLS_YTDLP_PATH: z.string().optional(),
  TOOLS_FFMPEG_PATH: z.string().optional(),
  TOOLS_FFPROBE_PATH: z.string().optional(),
  AI_PROVIDER: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().refine(v => !v || /^https?:\/\//.test(v), t('settings.invalidUrl')).optional(),
  AI_MODEL: z.string().optional()
}))

function maskSecret(value: string) {
  if (!value) return ''
  return '•'.repeat(16) + value.slice(-4)
}

function getErrorMessage(err: unknown): string {
  const data = (err as { data?: { statusMessage?: string } }).data
  if (data?.statusMessage) return data.statusMessage
  if (err instanceof Error && err.message) return err.message
  return t('global.error')
}

async function loadConfig() {
  loading.value = true
  try {
    const res = await $fetch<{ success: boolean, data: { values: Record<string, string> } }>('/api/system/config')
    for (const key of Object.keys(config) as ConfigKeys[]) {
      if (res.data.values[key]) config[key] = res.data.values[key]
    }
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err), color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(loadConfig)

async function onSubmit() {
  if (saving.value) return
  saving.value = true
  try {
    const values = { ...config }
    const res = await $fetch<{ success: boolean, data: { values: Record<string, string>, restartRequired: boolean } }>('/api/system/config', {
      method: 'PUT',
      body: { values }
    })

    if (hasElectron.value) {
      await window.electronAPI!.setConfig(values)
    }

    for (const key of Object.keys(config) as ConfigKeys[]) {
      if (res.data.values[key]) config[key] = res.data.values[key]
    }

    toast.add({ title: t('settings.saved'), icon: 'i-lucide-check', color: 'success' })
    if (res.data.restartRequired) {
      toast.add({ title: t('settings.restartRequired'), color: 'warning' })
    }
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="font-semibold text-lg">
              {{ t('settings.connections') }}
            </p>
            <p class="text-sm text-muted">
              {{ t('settings.connectionsDesc') }}
            </p>
          </div>
          <UButton
            form="connections"
            :label="t('settings.saveChanges')"
            color="primary"
            type="submit"
            :loading="saving"
          />
        </div>
      </template>
      <UAlert
        icon="i-lucide-database"
        color="info"
        variant="subtle"
        :title="t('settings.storageTitle')"
        :description="t('settings.storageDesc')"
      />
    </UCard>

    <UForm
      v-if="!loading"
      id="connections"
      :schema="schema"
      :state="config"
      class="space-y-6"
      @submit="onSubmit"
    >
      <UCard variant="subtle">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-simple-icons-mongodb" class="text-green-600 dark:text-green-500 size-5" />
            <p class="font-semibold">
              MongoDB
            </p>
          </div>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField name="MONGODB_URI" label="MongoDB URI">
            <UInput v-model="config.MONGODB_URI" class="w-full" placeholder="mongodb://localhost:27017" />
          </UFormField>
          <UFormField name="MONGODB_DB_NAME" label="Database Name">
            <UInput v-model="config.MONGODB_DB_NAME" class="w-full" placeholder="electron_nuxt" />
          </UFormField>
        </div>
      </UCard>

      <UCard variant="subtle">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-simple-icons-supabase" class="text-emerald-500 size-5" />
            <p class="font-semibold">
              {{ t('settings.supabase') }}
            </p>
          </div>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField name="SUPABASE_URL" label="Supabase URL">
            <UInput v-model="config.SUPABASE_URL" class="w-full" placeholder="https://xxx.supabase.co" />
          </UFormField>
          <UFormField name="SUPABASE_PUBLISHABLE_KEY" label="Supabase Publishable Key">
            <UInput v-model="config.SUPABASE_PUBLISHABLE_KEY" class="w-full" />
          </UFormField>
          <UFormField name="SUPABASE_SERVICE_ROLE_KEY" label="Supabase Service Role Key" :description="t('settings.bypassRls')">
            <BasePasswordInput v-model="config.SUPABASE_SERVICE_ROLE_KEY" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard variant="subtle">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-simple-icons-cloudinary" class="text-blue-500 size-5" />
            <p class="font-semibold">
              {{ t('settings.cloudinary') }}
            </p>
          </div>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField name="CLOUDINARY_CLOUD_NAME" label="Cloud Name">
            <UInput v-model="config.CLOUDINARY_CLOUD_NAME" class="w-full" />
          </UFormField>
          <UFormField name="CLOUDINARY_API_KEY" label="API Key">
            <UInput v-model="config.CLOUDINARY_API_KEY" class="w-full" />
          </UFormField>
          <UFormField name="CLOUDINARY_API_SECRET" label="API Secret">
            <BasePasswordInput v-model="config.CLOUDINARY_API_SECRET" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard variant="subtle">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-simple-icons-firebase" class="text-amber-500 size-5" />
            <p class="font-semibold">
              {{ t('settings.firebase') }}
            </p>
          </div>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField name="FIREBASE_PROJECT_ID" label="Project ID">
            <UInput v-model="config.FIREBASE_PROJECT_ID" class="w-full" />
          </UFormField>
          <UFormField name="FIREBASE_CLIENT_EMAIL" label="Client Email">
            <UInput v-model="config.FIREBASE_CLIENT_EMAIL" class="w-full" />
          </UFormField>
          <UFormField name="FIREBASE_PRIVATE_KEY" label="Private Key">
            <div class="flex items-center gap-2 w-full">
              <UTextarea
                v-if="showFirebaseKey"
                v-model="config.FIREBASE_PRIVATE_KEY"
                :rows="3"
                class="w-full font-mono text-xs"
              />
              <UInput
                v-else
                type="password"
                readonly
                :model-value="maskSecret(config.FIREBASE_PRIVATE_KEY)"
                :placeholder="t('settings.secretPlaceholder')"
                class="w-full font-mono text-xs"
              />
              <UButton
                :icon="showFirebaseKey ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="showFirebaseKey ? t('auth.hidePassword') : t('auth.showPassword')"
                @click="showFirebaseKey = !showFirebaseKey"
              />
            </div>
          </UFormField>
          <UFormField name="FIREBASE_STORAGE_BUCKET" label="Storage Bucket">
            <UInput v-model="config.FIREBASE_STORAGE_BUCKET" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard variant="subtle">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-bell-ring" class="text-indigo-500 size-5" />
            <p class="font-semibold">
              {{ t('settings.webPush') }}
            </p>
          </div>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField name="WEB_PUSH_PUBLIC_KEY" label="VAPID Public Key">
            <UInput v-model="config.WEB_PUSH_PUBLIC_KEY" class="w-full" />
          </UFormField>
          <UFormField name="WEB_PUSH_PRIVATE_KEY" label="VAPID Private Key">
            <BasePasswordInput v-model="config.WEB_PUSH_PRIVATE_KEY" class="w-full" />
          </UFormField>
          <UFormField name="WEB_PUSH_SUBJECT" label="Subject">
            <UInput v-model="config.WEB_PUSH_SUBJECT" class="w-full" placeholder="mailto:admin@example.com" />
          </UFormField>
        </div>
      </UCard>

      <UCard variant="subtle">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-app-window" class="text-teal-500 size-5" />
            <p class="font-semibold">
              {{ t('settings.app') }}
            </p>
          </div>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField name="APP_NAME" label="App Name">
            <UInput v-model="config.APP_NAME" class="w-full" />
          </UFormField>
          <UFormField name="APP_URL" label="App URL">
            <UInput v-model="config.APP_URL" class="w-full" />
          </UFormField>
          <UFormField name="APP_PORT" label="App Port">
            <UInput v-model="config.APP_PORT" class="w-full" placeholder="3456" />
          </UFormField>
        </div>
      </UCard>

      <UCard variant="subtle">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-bot" class="text-violet-500 size-5" />
            <p class="font-semibold">
              {{ t('settings.ai') }}
            </p>
          </div>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField name="AI_PROVIDER" :label="t('settings.aiProvider')">
            <USelect
              v-model="config.AI_PROVIDER"
              :items="[
                { label: 'Google Gemini', value: 'gemini' },
                { label: 'OpenRouter', value: 'openrouter' },
                { label: 'OpenAI Compatible', value: 'custom' }
              ]"
              class="w-full"
            />
          </UFormField>
          <UFormField name="AI_API_KEY" :label="t('settings.aiApiKey')">
            <BasePasswordInput v-model="config.AI_API_KEY" class="w-full" />
          </UFormField>
          <UFormField name="AI_BASE_URL" :label="t('settings.aiBaseUrl')" :description="t('settings.aiBaseUrlDesc')">
            <UInput v-model="config.AI_BASE_URL" class="w-full font-mono text-xs" placeholder="https://api.openrouter.ai/api/v1" />
          </UFormField>
          <UFormField name="AI_MODEL" :label="t('settings.aiModel')" :description="t('settings.aiModelDesc')">
            <UInput v-model="config.AI_MODEL" class="w-full" placeholder="gemini-2.0-flash" />
          </UFormField>
        </div>
      </UCard>

      <UCard variant="subtle">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-folder-cog" class="text-gray-500 size-5" />
            <p class="font-semibold">
              {{ t('tools.taskManager') }}
            </p>
          </div>
        </template>
        <div class="flex flex-col gap-4">
          <UFormField name="TOOLS_YTDLP_PATH" label="yt-dlp Path" :description="t('settings.emptyForDefault')">
            <UInput v-model="config.TOOLS_YTDLP_PATH" class="w-full font-mono text-xs" placeholder="D:/Applications/tm-tools/resources/yt-dlp.exe" />
          </UFormField>
          <UFormField name="TOOLS_FFMPEG_PATH" label="FFmpeg Path" :description="t('settings.emptyForDefault')">
            <UInput v-model="config.TOOLS_FFMPEG_PATH" class="w-full font-mono text-xs" placeholder="D:/Applications/tm-tools/resources/ffmpeg.exe" />
          </UFormField>
          <UFormField name="TOOLS_FFPROBE_PATH" label="FFprobe Path" :description="t('settings.emptyForDefault')">
            <UInput v-model="config.TOOLS_FFPROBE_PATH" class="w-full font-mono text-xs" placeholder="D:/Applications/tm-tools/resources/ffprobe.exe" />
          </UFormField>
        </div>
      </UCard>
    </UForm>

    <div v-else class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="size-6 text-muted animate-spin" />
    </div>
  </div>
</template>

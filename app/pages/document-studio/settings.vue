<script setup lang="ts">
import { isDocumentConnectionError } from '~/utils/documentStudio'

const { t } = useI18n()
const api = useDocumentApi()
const { pickFolder } = useFileSystem()
const notify = useNotify()

type Health = Awaited<ReturnType<ReturnType<typeof useDocumentApi>['health']>>
type Settings = Awaited<ReturnType<ReturnType<typeof useDocumentApi>['settings']>>

const OUTPUT_PATH_STORAGE_KEY = 'document_studio:custom_output_dir'
const settings = ref<Settings | null>(null)
const health = ref<Health | null>(null)
const loading = ref(true)
const error = ref('')
const errorCode = ref<string | null>(null)
const customOutputPath = ref('')

async function load() {
  loading.value = true
  error.value = ''
  errorCode.value = null
  try {
    const [nextSettings, nextHealth] = await Promise.all([api.settings(), api.health()])
    settings.value = nextSettings
    health.value = nextHealth
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(OUTPUT_PATH_STORAGE_KEY)
      customOutputPath.value = saved || nextSettings.defaultOutputPath
    }
  } catch (caught) {
    errorCode.value = (caught as { code?: string })?.code || null
    error.value = t('document.errors.generic')
  } finally {
    loading.value = false
  }
}

async function handleBrowseFolder() {
  const picked = await pickFolder({ defaultPath: customOutputPath.value })
  if (picked) {
    customOutputPath.value = picked
    saveOutputPath()
  }
}

function saveOutputPath() {
  const val = customOutputPath.value.trim()
  if (typeof window !== 'undefined') {
    if (val) {
      localStorage.setItem(OUTPUT_PATH_STORAGE_KEY, val)
    } else {
      localStorage.removeItem(OUTPUT_PATH_STORAGE_KEY)
    }
  }
  notify.success(t('global.save'), t('document.settings.storage.outputPathUpdated'))
}

function resetOutputPath() {
  if (settings.value?.defaultOutputPath) {
    customOutputPath.value = settings.value.defaultOutputPath
    if (typeof window !== 'undefined') {
      localStorage.removeItem(OUTPUT_PATH_STORAGE_KEY)
    }
    notify.success(t('global.reset'), t('document.settings.storage.outputPathUpdated'))
  }
}

onMounted(load)

const runtimeLabel = computed(() => {
  const runtime = settings.value?.runtime ?? health.value?.runtime
  return runtime ? t(`document.runtime.${runtime}`) : '—'
})

const driverLabel = computed(() => {
  const driver = health.value?.storage.driver
  return driver ? t(`document.settings.runtime.drivers.${driver}`) : '—'
})

const folderDelivery = computed(() => settings.value?.delivery === 'folder')

const driverReady = computed(() => Boolean(health.value?.storage.configured))
const databaseReady = computed(() => Boolean(health.value?.database.connected))

const limits = computed(() => health.value?.limits ?? null)
</script>

<template>
  <BasePage
    id="document-studio-settings"
    :title="t('document.settings.title')"
    :description="t('document.settings.description')"
  >
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6">
      <div v-if="loading" class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        {{ t('common.loading') }}
      </div>

      <DocumentStudioConnectionAlert
        v-else-if="isDocumentConnectionError(errorCode)"
        :code="errorCode"
        @retry="load"
      />

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :title="error"
      />

      <template v-else>
        <section class="panel-flat rounded-lg p-4">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {{ t('document.settings.storage.title') }}
          </h2>
          <dl class="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt class="text-xs text-muted">
                {{ t('document.settings.storage.delivery') }}
              </dt>
              <dd class="mt-0.5 flex items-center gap-2 text-sm">
                <UIcon
                  :name="folderDelivery ? 'i-lucide-folder-output' : 'i-lucide-download'"
                  class="size-4 text-primary"
                />
                {{ folderDelivery ? t('document.settings.storage.folder') : t('document.settings.storage.download') }}
              </dd>
            </div>

            <div v-if="folderDelivery" class="sm:col-span-2">
              <dt class="text-xs text-muted mb-1">
                {{ t('document.settings.storage.outputPath') }}
              </dt>
              <dd class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <UInput v-model="customOutputPath" class="w-full flex-1 font-mono text-xs" />
                <div class="flex items-center gap-2 shrink-0">
                  <UButton
                    color="neutral"
                    variant="soft"
                    size="xs"
                    icon="i-lucide-folder-open"
                    :label="t('document.input.browseFolder')"
                    @click="handleBrowseFolder"
                  />
                  <UButton
                    color="primary"
                    variant="soft"
                    size="xs"
                    icon="i-lucide-save"
                    :label="t('global.save')"
                    @click="saveOutputPath"
                  />
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-rotate-ccw"
                    :label="t('global.reset')"
                    @click="resetOutputPath"
                  />
                </div>
              </dd>
            </div>
          </dl>

          <p v-if="!folderDelivery && settings" class="mt-3 rounded-md bg-elevated/40 px-3 py-2 text-xs text-muted">
            {{ t('document.settings.storage.cloudNotice', { days: settings.defaultRetentionDays }) }}
          </p>
        </section>

        <section class="panel-flat rounded-lg p-4">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {{ t('document.settings.runtime.title') }}
          </h2>
          <dl class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt class="text-xs text-muted">
                {{ t('document.settings.runtime.engine') }}
              </dt>
              <dd class="mt-0.5 flex items-center gap-2 text-sm">
                <UIcon name="i-lucide-cpu" class="size-4 text-primary" />
                {{ runtimeLabel }}
              </dd>
            </div>

            <div>
              <dt class="text-xs text-muted">
                {{ t('document.settings.runtime.driver') }}
              </dt>
              <dd class="mt-0.5 flex items-center gap-2 text-sm">
                <UIcon name="i-lucide-hard-drive" class="size-4 text-primary" />
                {{ driverLabel }}
              </dd>
            </div>

            <div>
              <dt class="text-xs text-muted">
                {{ t('document.settings.runtime.database') }}
              </dt>
              <dd class="mt-0.5">
                <UBadge :color="databaseReady ? 'success' : 'neutral'" variant="soft" size="sm">
                  {{ databaseReady ? t('document.settings.runtime.connected') : t('document.settings.runtime.missing')
                  }}
                </UBadge>
              </dd>
            </div>

            <div>
              <dt class="text-xs text-muted">
                {{ t('document.settings.runtime.session') }}
              </dt>
              <dd class="mt-0.5 text-sm">
                {{ health?.storage.requiresSession ? t('global.yes') : t('global.no') }}
              </dd>
            </div>
          </dl>

          <p class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <UBadge :color="driverReady ? 'success' : 'warning'" variant="soft" size="sm">
              {{ driverReady ? t('document.settings.runtime.persistent') : t('document.settings.runtime.ephemeral') }}
            </UBadge>
            <span>{{ health?.storage.mode === 'durable' ? t('document.settings.runtime.durableHint')
              : t('document.settings.runtime.ephemeralHint') }}</span>
          </p>
        </section>

        <section v-if="limits" class="panel-flat rounded-lg p-4">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {{ t('document.settings.limits.title') }}
          </h2>
          <dl class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt class="text-xs text-muted">
                {{ t('document.settings.limits.file') }}
              </dt>
              <dd class="mt-0.5 text-sm">
                {{ formatBytes(limits.maxFileBytes) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                {{ t('document.settings.limits.total') }}
              </dt>
              <dd class="mt-0.5 text-sm">
                {{ formatBytes(limits.maxTotalInputBytes) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                {{ t('document.settings.limits.files') }}
              </dt>
              <dd class="mt-0.5 text-sm">
                {{ limits.maxInputFiles }}
              </dd>
            </div>
            <div v-if="health?.storage.ephemeral">
              <dt class="text-xs text-muted">
                {{ t('document.settings.limits.inline') }}
              </dt>
              <dd class="mt-0.5 text-sm">
                {{ Math.round(limits.maxInlineDurationMs / 1000) }}s
              </dd>
            </div>
          </dl>
        </section>

        <section v-if="settings" class="panel-flat rounded-lg p-4">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {{ t('document.settings.cleanup.title') }}
          </h2>
          <p class="mt-3 text-sm">
            {{ t('document.settings.cleanup.retention', {
              days: settings.defaultRetentionDays,
              max:
                settings.maxRetentionDays }) }}
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <UButton
              to="/document-studio/activity"
              icon="i-lucide-history"
              color="neutral"
              variant="soft"
              size="sm"
              :label="t('document.settings.cleanup.deleteNow')"
            />
            <span class="text-xs text-muted">{{ t('document.settings.cleanup.deleteHint') }}</span>
          </div>
        </section>
      </template>
    </div>
  </BasePage>
</template>

<script setup lang="ts">
import type { UserSession } from '~/types/auth'
import { z } from 'zod'
import { getErrorMessage } from '~/shared/utils/errors'

const toast = useToast()
const { t } = useI18n()
const auth = useAuth()
const router = useRouter()

const passwordFields = reactive({
  current: '',
  new: ''
})

const passwordSchema = computed(() => z.object({
  current: z.string().min(1, t('auth.passwordMin')),
  new: z.string().min(6, t('auth.passwordMin'))
}))

const passwordSaving = ref(false)

async function onUpdatePassword() {
  if (passwordSaving.value) return
  passwordSaving.value = true
  try {
    await $fetch(`/api/users?id=${auth.user.value?.id}`, {
      method: 'PUT',
      body: { password: passwordFields.new }
    })
    passwordFields.current = ''
    passwordFields.new = ''
    toast.add({ title: t('settings.passwordUpdated'), icon: 'i-lucide-check', color: 'success' })
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    passwordSaving.value = false
  }
}

const { data: sessions, refresh } = await useFetch<{ success: boolean; data: UserSession[] }>('/api/auth/sessions', {
  default: () => ({ success: true, data: [] })
})

type ConfirmAction =
  | { type: 'session'; session: UserSession }
  | { type: 'all' }

const confirmAction = ref<ConfirmAction | null>(null)
const processing = ref(false)

const confirmModalOpen = computed({
  get: () => !!confirmAction.value,
  set: (v: boolean) => { if (!v) confirmAction.value = null }
})

const confirmTitle = computed(() => confirmAction.value?.type === 'all' ? t('settings.revokeAllTitle') : t('settings.revokeSessionTitle'))
const confirmDescription = computed(() => confirmAction.value?.type === 'all' ? t('settings.revokeAllDesc') : t('settings.revokeSessionDesc'))

async function handleConfirm() {
  const action = confirmAction.value
  if (!action) return
  if (processing.value) return
  processing.value = true
  try {
    if (action.type === 'all') {
      await $fetch('/api/auth/revoke', { method: 'POST', headers: { Authorization: `Bearer ${auth.accessToken.value}` } })
      toast.add({ title: t('auth.sessionRevoked'), icon: 'i-lucide-check', color: 'success' })
      await auth.logout()
      await router.push('/login')
      return
    }

    await $fetch('/api/auth/sessions/revoke', { method: 'POST', body: { sessionId: action.session.id } })
    if (action.session.isCurrent) {
      toast.add({ title: t('settings.currentRevoked'), icon: 'i-lucide-check', color: 'success' })
      await auth.logout()
      await router.push('/login')
      return
    }
    toast.add({ title: t('auth.sessionRevoked'), icon: 'i-lucide-check', color: 'success' })
    refresh()
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    processing.value = false
    confirmAction.value = null
  }
}

async function copySession(s: UserSession) {
  const text = [
    `ID: ${s.id}`,
    `Platform: ${s.platform}`,
    `User Agent: ${s.userAgent}`,
    `IP: ${s.lastIp || t('common.unknown')}`,
    `Created: ${new Date(s.createdAt).toLocaleString()}`,
    `Expires: ${new Date(s.expiresAt).toLocaleString()}`,
    `Current: ${s.isCurrent ? 'Yes' : 'No'}`
  ].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: t('settings.copied'), icon: 'i-lucide-copy-check', color: 'success' })
  } catch {
    toast.add({ title: t('global.error'), color: 'error' })
  }
}

function formatUA(ua: string) {
  if (!ua) return t('common.unknown')
  if (ua.includes('Electron')) return t('common.desktopApp')
  if (ua.includes('Chrome')) return t('common.chrome')
  if (ua.includes('Firefox')) return t('common.firefox')
  if (ua.includes('Safari') && !ua.includes('Chrome')) return t('common.safari')
  if (ua.includes('Edge')) return t('common.edge')
  return ua.slice(0, 50)
}
</script>

<template>
  <UPageCard :title="$t('settings.password')" :description="$t('settings.passwordDesc')" variant="subtle">
    <UForm :schema="passwordSchema" :state="passwordFields" class="flex flex-col gap-4 max-w-xs" @submit="onUpdatePassword">
      <UFormField name="current" :label="$t('settings.currentPassword')">
        <BasePasswordInput v-model="passwordFields.current" :placeholder="$t('settings.currentPasswordPlaceholder')" class="w-full" />
      </UFormField>
      <UFormField name="new" :label="$t('settings.newPassword')">
        <BasePasswordInput v-model="passwordFields.new" :placeholder="$t('settings.newPasswordPlaceholder')" class="w-full" />
      </UFormField>
      <UButton :label="$t('settings.update')" class="w-fit" type="submit" :loading="passwordSaving" />
    </UForm>
  </UPageCard>

  <UPageCard :title="$t('settings.activeSessions')" :description="$t('settings.activeSessionsDesc')" variant="subtle" class="mt-4">
    <template #footer>
      <div class="space-y-3">
        <div v-for="s in sessions?.data || []" :key="s.id" class="flex items-center justify-between p-3 rounded-lg border border-default" :class="{ 'ring-1 ring-primary': s.isCurrent }">
          <div class="flex items-center gap-3 min-w-0">
            <UIcon :name="s.platform === 'desktop' || s.userAgent.includes('Electron') ? 'i-lucide-monitor' : s.platform === 'mobile' ? 'i-lucide-smartphone' : 'i-lucide-globe'" class="text-xl text-muted shrink-0" />
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm">{{ formatUA(s.userAgent) }}</span>
                <UBadge v-if="s.isCurrent" :label="$t('settings.current')" color="primary" variant="solid" size="sm" />
              </div>
              <p class="text-xs text-muted truncate">{{ s.platform }} · {{ $t('common.ip') }}: {{ s.lastIp || t('common.unknown') }}</p>
              <p class="text-xs text-dimmed">{{ new Date(s.createdAt).toLocaleString() }}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UButton :label="$t('settings.copy')" color="neutral" variant="ghost" size="sm" icon="i-lucide-copy" @click="copySession(s)" />
            <UButton :label="$t('settings.revoke')" color="error" variant="ghost" size="sm" icon="i-lucide-log-out" @click="confirmAction = { type: 'session', session: s }" />
          </div>
        </div>
        <div v-if="(sessions?.data || []).length === 0" class="text-sm text-muted text-center py-4">{{ $t('settings.noSessions') }}</div>
        <UButton v-if="(sessions?.data || []).length > 0" :label="$t('settings.revokeAll')" color="error" variant="outline" size="sm" icon="i-lucide-log-out" @click="confirmAction = { type: 'all' }" />
      </div>
    </template>
  </UPageCard>

  <UPageCard :title="$t('settings.account')" :description="$t('settings.accountDesc')" class="mt-4 bg-linear-to-tl from-error/10 from-5% to-default">
    <template #footer>
      <UButton :label="$t('settings.deleteAccount')" color="error" />
    </template>
  </UPageCard>

  <LazyBaseConfirmModal
    v-model:open="confirmModalOpen"
    :title="confirmTitle"
    :description="confirmDescription"
    :loading="processing"
    @confirm="handleConfirm"
    @cancel="confirmAction = null"
  />
</template>

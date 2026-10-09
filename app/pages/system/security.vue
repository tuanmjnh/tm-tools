<script setup lang="ts">
import type { UserSession } from '~/types/auth'
import type { PasskeyInfo } from '~/types/webauthn'
import { z } from 'zod'
import { getErrorMessage } from '~/shared/utils/errors'

const toast = useToast()
const { t } = useI18n()
const auth = useAuth()
const router = useRouter()
const passkeyApi = usePasskey()

const passwordFields = reactive({
  current: '',
  new: ''
})

const passwordSchema = computed(() => z.object({
  current: z.string().min(1, t('auth.passwordMin')),
  new: z.string().min(6, t('auth.passwordMin'))
}))

const passwordSaving = ref(false)
const { hubFetch, appId } = useHub()

async function onUpdatePassword() {
  if (passwordSaving.value) return
  passwordSaving.value = true
  try {
    await hubFetch(`/api/v1/apps/${appId}/users?id=${auth.user.value?.id}`, {
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

const sessions = ref<{ success: boolean, data: UserSession[] }>({ success: true, data: [] })
const refresh = () => {}

type ConfirmAction
  = | { type: 'session', session: UserSession }
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

interface MeSecurityData {
  userId: string
  totpEnabled?: boolean
  features?: { passkey?: boolean, totp?: boolean }
}

const totpEnabled = ref(false)
const passkeyEnabled = ref(true)
const totpFeatureEnabled = ref(true)
const meLoaded = ref(false)

const loadMe = async () => {
  try {
    const res = await hubFetch<{ success: boolean, data: MeSecurityData }>('/api/v1/auth/me')
    totpEnabled.value = !!res.data?.totpEnabled
    passkeyEnabled.value = res.data?.features?.passkey !== false
    totpFeatureEnabled.value = res.data?.features?.totp !== false
  } catch {
    // keep defaults
  } finally {
    meLoaded.value = true
  }
}

const passkeys = ref<PasskeyInfo[]>([])
const passkeyLoading = ref(false)
const passkeyAddLoading = ref(false)
const passkeyDeleteTarget = ref<PasskeyInfo | null>(null)
const passkeyDeleteOpen = ref(false)

const loadPasskeys = async () => {
  if (!passkeyEnabled.value) return
  passkeyLoading.value = true
  try {
    passkeys.value = await passkeyApi.list()
  } catch {
    passkeys.value = []
  } finally {
    passkeyLoading.value = false
  }
}

const addPasskey = async () => {
  passkeyAddLoading.value = true
  try {
    await passkeyApi.register()
    toast.add({ title: t('profile.passkeyAdded'), icon: 'i-lucide-check', color: 'success' })
    await loadPasskeys()
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name
    if (name === 'NotAllowedError') toast.add({ title: t('profile.passkeyCancelled'), color: 'neutral' })
    else toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    passkeyAddLoading.value = false
  }
}

const confirmDeletePasskey = async () => {
  if (!passkeyDeleteTarget.value) return
  try {
    await passkeyApi.remove(passkeyDeleteTarget.value.credentialId)
    toast.add({ title: t('profile.passkeyDeleted'), icon: 'i-lucide-check', color: 'success' })
    passkeys.value = passkeys.value.filter(p => p.id !== passkeyDeleteTarget.value?.id)
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    passkeyDeleteOpen.value = false
    passkeyDeleteTarget.value = null
  }
}

const totpSetupOpen = ref(false)
const totpSetupQr = ref('')
const totpSetupCode = ref('')
const totpSetupLoading = ref(false)
const totpSetupStep = ref<'scan' | 'recovery'>('scan')
const recoveryCodes = ref<string[]>([])

const openTotpSetup = async () => {
  totpSetupLoading.value = true
  try {
    const res = await hubFetch<{ success: boolean, data: { qrDataUrl: string } }>('/api/v1/auth/totp/setup', {
      method: 'POST',
      body: { appId }
    })
    totpSetupQr.value = res.data.qrDataUrl
    totpSetupCode.value = ''
    totpSetupStep.value = 'scan'
    recoveryCodes.value = []
    totpSetupOpen.value = true
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    totpSetupLoading.value = false
  }
}

const verifyTotpSetup = async () => {
  totpSetupLoading.value = true
  try {
    const res = await hubFetch<{ success: boolean, data: { recoveryCodes: string[] } }>('/api/v1/auth/totp/verify', {
      method: 'POST',
      body: { code: totpSetupCode.value.trim() }
    })
    recoveryCodes.value = res.data.recoveryCodes
    totpSetupStep.value = 'recovery'
    totpEnabled.value = true
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    totpSetupLoading.value = false
  }
}

const closeTotpSetup = () => {
  totpSetupOpen.value = false
  totpSetupQr.value = ''
  totpSetupCode.value = ''
  recoveryCodes.value = []
}

const copyRecoveryCodes = async () => {
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    toast.add({ title: t('profile.recoveryCopied'), icon: 'i-lucide-copy-check', color: 'success' })
  } catch {
    toast.add({ title: t('global.error'), color: 'error' })
  }
}

const totpDisableOpen = ref(false)
const totpDisableCode = ref('')
const totpDisableLoading = ref(false)

const disableTotp = async () => {
  totpDisableLoading.value = true
  try {
    await hubFetch('/api/v1/auth/totp/disable', {
      method: 'POST',
      body: { code: totpDisableCode.value.trim() }
    })
    toast.add({ title: t('profile.totpDisabled'), icon: 'i-lucide-check', color: 'success' })
    totpEnabled.value = false
    totpDisableOpen.value = false
    totpDisableCode.value = ''
  } catch (err: unknown) {
    toast.add({ title: getErrorMessage(err, key => t(key)), color: 'error' })
  } finally {
    totpDisableLoading.value = false
  }
}

onMounted(() => {
  loadMe()
  loadPasskeys()
})
</script>

<template>
  <div class="space-y-6">
    <UPageCard :title="$t('settings.password')" :description="$t('settings.passwordDesc')" variant="subtle">
      <UForm
        :schema="passwordSchema"
        :state="passwordFields"
        class="flex flex-col gap-4 max-w-xs"
        @submit="onUpdatePassword"
      >
        <UFormField name="current" :label="$t('settings.currentPassword')">
          <BasePasswordInput
            v-model="passwordFields.current"
            :placeholder="$t('settings.currentPasswordPlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField name="new" :label="$t('settings.newPassword')">
          <BasePasswordInput
            v-model="passwordFields.new"
            :placeholder="$t('settings.newPasswordPlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UButton
          :label="$t('settings.update')"
          class="w-fit"
          type="submit"
          :loading="passwordSaving"
        />
      </UForm>
    </UPageCard>

    <UPageCard v-if="passkeyEnabled && meLoaded" variant="subtle">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-fingerprint" class="size-5 text-primary" />
            <div>
              <h3 class="font-semibold text-highlight">
                {{ $t('profile.passkeysTitle') }}
              </h3>
              <p class="text-sm text-muted">
                {{ $t('profile.passkeysDesc') }}
              </p>
            </div>
          </div>
          <UButton
            icon="i-lucide-plus"
            size="sm"
            color="primary"
            variant="soft"
            :label="$t('profile.passkeyAdd')"
            :loading="passkeyAddLoading"
            @click="addPasskey"
          />
        </div>
      </template>

      <div v-if="passkeyLoading" class="flex justify-center py-6">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" />
      </div>

      <div v-else-if="!passkeys.length" class="text-sm text-muted py-4">
        {{ $t('profile.noPasskeys') }}
      </div>

      <ul v-else class="divide-y divide-default">
        <li v-for="pk in passkeys" :key="pk.id" class="flex items-center justify-between gap-3 py-3">
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">
              {{ pk.deviceName || $t('profile.passkeyDefaultName') }}
            </p>
            <p class="text-xs text-muted">
              {{ $t('profile.passkeyCreated') }}: {{ new Date(pk.createdAt).toLocaleDateString() }}
              <template v-if="pk.lastUsedAt">
                · {{ $t('profile.passkeyLastUsed') }}: {{ new Date(pk.lastUsedAt).toLocaleDateString() }}
              </template>
            </p>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            size="xs"
            color="error"
            variant="ghost"
            :aria-label="$t('profile.passkeyDelete')"
            @click="passkeyDeleteTarget = pk; passkeyDeleteOpen = true"
          />
        </li>
      </ul>
    </UPageCard>

    <UPageCard v-if="totpFeatureEnabled && meLoaded" variant="subtle">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-shield-check" class="size-5 text-primary" />
            <div>
              <h3 class="font-semibold text-highlight">
                {{ $t('profile.totpTitle') }}
              </h3>
              <p class="text-sm text-muted">
                {{ $t('profile.totpDesc') }}
              </p>
            </div>
            <UBadge :color="totpEnabled ? 'success' : 'neutral'" variant="subtle" size="sm">
              {{ totpEnabled ? $t('profile.totpOn') : $t('profile.totpOff') }}
            </UBadge>
          </div>
          <UButton
            v-if="!totpEnabled"
            icon="i-lucide-shield"
            size="sm"
            color="primary"
            variant="soft"
            :label="$t('profile.totpEnable')"
            :loading="totpSetupLoading"
            @click="openTotpSetup"
          />
          <UButton
            v-else
            icon="i-lucide-shield-off"
            size="sm"
            color="error"
            variant="soft"
            :label="$t('profile.totpDisable')"
            @click="totpDisableOpen = true"
          />
        </div>
      </template>
    </UPageCard>

    <UPageCard :title="$t('settings.activeSessions')" :description="$t('settings.activeSessionsDesc')" variant="subtle">
      <template #footer>
        <div class="space-y-3">
          <div
            v-for="s in sessions?.data || []"
            :key="s.id"
            class="flex items-center justify-between p-3 rounded-lg border border-default"
            :class="{ 'ring-1 ring-primary': s.isCurrent }"
          >
            <div class="flex items-center gap-3 min-w-0">
              <UIcon
                :name="s.platform === 'desktop' || s.userAgent.includes('Electron') ? 'i-lucide-monitor' : s.platform === 'mobile' ? 'i-lucide-smartphone' : 'i-lucide-globe'"
                class="text-xl text-muted shrink-0"
              />
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">{{ formatUA(s.userAgent) }}</span>
                  <UBadge
                    v-if="s.isCurrent"
                    :label="$t('settings.current')"
                    color="primary"
                    variant="solid"
                    size="sm"
                  />
                </div>
                <p class="text-xs text-muted truncate">
                  {{ s.platform }} · {{ $t('common.ip') }}: {{ s.lastIp || t('common.unknown') }}
                </p>
                <p class="text-xs text-dimmed">
                  {{ new Date(s.createdAt).toLocaleString() }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <UButton
                :label="$t('settings.copy')"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-copy"
                @click="copySession(s)"
              />
              <UButton
                :label="$t('settings.revoke')"
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-log-out"
                @click="confirmAction = { type: 'session', session: s }"
              />
            </div>
          </div>
          <div v-if="(sessions?.data || []).length === 0" class="text-sm text-muted text-center py-4">
            {{ $t('settings.noSessions') }}
          </div>
          <UButton
            v-if="(sessions?.data || []).length > 0"
            :label="$t('settings.revokeAll')"
            color="error"
            variant="outline"
            size="sm"
            icon="i-lucide-log-out"
            @click="confirmAction = { type: 'all' }"
          />
        </div>
      </template>
    </UPageCard>

    <UPageCard
      :title="$t('settings.account')"
      :description="$t('settings.accountDesc')"
      class="bg-linear-to-tl from-error/10 from-5% to-default"
    >
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

    <UModal v-model:open="passkeyDeleteOpen" :title="$t('profile.passkeyDelete')" icon="i-lucide-trash-2">
      <template #body>
        <p class="text-sm text-muted">
          {{ $t('profile.passkeyDeleteConfirm') }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            :label="$t('common.cancel')"
            @click="passkeyDeleteOpen = false; passkeyDeleteTarget = null"
          />
          <UButton color="error" :label="$t('profile.passkeyDelete')" @click="confirmDeletePasskey" />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="totpSetupOpen"
      :title="$t('profile.totpEnable')"
      icon="i-lucide-shield-check"
      @update:open="v => !v && closeTotpSetup()"
    >
      <template #body>
        <div v-if="totpSetupStep === 'scan'" class="space-y-4">
          <p class="text-sm text-muted">
            {{ $t('profile.totpScanDesc') }}
          </p>
          <div class="flex justify-center">
            <img
              v-if="totpSetupQr"
              :src="totpSetupQr"
              :alt="$t('profile.totpQrAlt')"
              class="size-48 rounded-lg border border-default"
            >
          </div>
          <UFormField :label="$t('profile.totpCodeLabel')" required>
            <UInput
              v-model="totpSetupCode"
              inputmode="numeric"
              maxlength="6"
              :placeholder="$t('profile.totpCodePlaceholder')"
              class="w-full text-center tracking-[0.4em]"
              size="lg"
            />
          </UFormField>
        </div>
        <div v-else class="space-y-4">
          <p class="text-sm text-muted">
            {{ $t('profile.recoveryDesc') }}
          </p>
          <ul class="grid grid-cols-2 gap-2 rounded-lg bg-default p-3 font-mono text-sm">
            <li v-for="code in recoveryCodes" :key="code">
              {{ code }}
            </li>
          </ul>
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="soft"
            size="sm"
            :label="$t('profile.recoveryCopy')"
            @click="copyRecoveryCodes"
          />
          <p class="text-xs text-warning">
            {{ $t('profile.recoveryWarning') }}
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            :label="$t('common.cancel')"
            @click="closeTotpSetup"
          />
          <UButton
            v-if="totpSetupStep === 'scan'"
            color="primary"
            :label="$t('profile.totpVerify')"
            :loading="totpSetupLoading"
            :disabled="totpSetupCode.trim().length < 6"
            @click="verifyTotpSetup"
          />
          <UButton
            v-else
            color="primary"
            :label="$t('common.done')"
            @click="closeTotpSetup"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="totpDisableOpen" :title="$t('profile.totpDisable')" icon="i-lucide-shield-off">
      <template #body>
        <p class="text-sm text-muted mb-4">
          {{ $t('profile.totpDisableDesc') }}
        </p>
        <UFormField :label="$t('profile.totpCodeLabel')" required>
          <UInput
            v-model="totpDisableCode"
            inputmode="numeric"
            maxlength="6"
            :placeholder="$t('profile.totpCodePlaceholder')"
            class="w-full text-center tracking-[0.4em]"
            size="lg"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            :label="$t('common.cancel')"
            @click="totpDisableOpen = false; totpDisableCode = ''"
          />
          <UButton
            color="error"
            :label="$t('profile.totpDisable')"
            :loading="totpDisableLoading"
            :disabled="totpDisableCode.trim().length < 6"
            @click="disableTotp"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

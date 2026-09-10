<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ProfileProxy } from '~/types'

const props = defineProps<{
  modelValue: boolean
  proxies: ProfileProxy[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const { saveProxy, deleteProxy, checkProxy, testingProxyId } = useProfileProxies()

const isOpen = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
})

const showAddForm = ref(false)
const form = ref<Partial<ProfileProxy>>({
  name: '',
  type: 'http',
  host: '',
  port: 8080,
  username: '',
  password: ''
})

function openAdd() {
  form.value = {
    name: `Proxy ${props.proxies.length + 1}`,
    type: 'http',
    host: '',
    port: 8080,
    username: '',
    password: ''
  }
  showAddForm.value = true
}

async function onSaveProxy() {
  if (!form.value.host || !form.value.port) return
  const ok = await saveProxy(form.value)
  if (ok) {
    showAddForm.value = false
    emit('saved')
  }
}

async function onDeleteProxy(id: string) {
  const ok = await deleteProxy(id)
  if (ok) emit('saved')
}

async function onTestProxy(p: ProfileProxy) {
  await checkProxy(p)
  emit('saved')
}
</script>

<template>
  <UModal v-model:open="isOpen" :title="t('profiles.manageProxies')" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div class="space-y-4">
        <!-- Action Header -->
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-500">{{ proxies.length }} proxies</span>
          <UButton size="xs" color="primary" variant="soft" icon="i-lucide-plus" :label="t('profiles.addProxy')"
            @click="openAdd" />
        </div>

        <!-- Add Form -->
        <div v-if="showAddForm"
          class="p-3 border rounded-lg bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
            <UInput v-model="form.name" size="sm" placeholder="Proxy Name" />
            <USelect v-model="form.type" size="sm" :items="[
              { label: 'HTTP', value: 'http' },
              { label: 'SOCKS5', value: 'socks5' }
            ]" />
            <div class="flex gap-1">
              <UInput v-model="form.host" size="sm" placeholder="Host / IP" class="flex-1" />
              <UInput v-model.number="form.port" type="number" size="sm" placeholder="Port" class="w-20" />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <UInput v-model="form.username" size="sm" placeholder="Username (optional)" />
            <UInput v-model="form.password" size="sm" type="password" placeholder="Password (optional)" />
          </div>

          <div class="flex justify-end gap-2">
            <UButton size="xs" color="neutral" variant="ghost" :label="t('global.cancel')"
              @click="showAddForm = false" />
            <UButton size="xs" color="primary" variant="soft" :label="t('global.save')" @click="onSaveProxy" />
          </div>
        </div>

        <!-- Proxies List -->
        <div class="divide-y divide-gray-100 dark:divide-gray-800 border rounded-lg overflow-hidden">
          <div v-if="proxies.length === 0" class="text-center py-6 text-sm text-gray-400">
            No proxies in pool. Click "Add Proxy" to add one.
          </div>

          <div v-for="p in proxies" :key="p.id"
            class="p-2.5 flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-900/50">
            <div class="flex items-center gap-3">
              <UBadge :color="p.status === 'active' ? 'success' : (p.status === 'dead' ? 'error' : 'neutral')"
                variant="subtle" size="sm">
                {{ p.type.toUpperCase() }}
              </UBadge>

              <div>
                <div class="font-medium text-sm flex items-center gap-2">
                  <span>{{ p.name }}</span>
                  <span class="text-xs font-mono text-gray-500">{{ p.host }}:{{ p.port }}</span>
                </div>
                <div v-if="p.latency_ms" class="text-xs text-gray-400">
                  Latency: {{ p.latency_ms }}ms {{ p.ip ? `• Exit IP: ${p.ip}` : '' }}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-activity"
                :loading="testingProxyId === p.id" :label="t('profiles.checkProxy')" @click="onTestProxy(p)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash" @click="onDeleteProxy(p.id)" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

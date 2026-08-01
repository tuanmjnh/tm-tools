<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { User } from '~/types'

const { t } = useI18n()
const toast = useToast()

const { customers, loading, filterQ, filterStatus, fetchCustomers, canLoadMore } = useCustomers()

const searchQuery = ref('')
const handleSearch = useDebounceFn((val: string) => {
  filterQ.value = val
}, 300)

watch(searchQuery, (val) => {
  handleSearch(val)
})

watch([filterStatus], () => {
  fetchCustomers(true)
})

watch(filterQ, () => {
  fetchCustomers(true)
})

onMounted(() => {
  fetchCustomers(true)
})

const selected = ref<User[]>([])

const statusColors = {
  subscribed: 'success' as const,
  unsubscribed: 'error' as const,
  bounced: 'warning' as const
}

const columns = computed(() => [
  { key: 'id', label: t('customers.id'), class: 'w-16' },
  { key: 'name', label: t('customers.name'), class: 'w-48' },
  { key: 'email', label: t('customers.email'), class: 'w-56' },
  { key: 'location', label: t('customers.location'), class: 'w-40' },
  { key: 'status', label: t('customers.status'), class: 'w-28' }
])

const getActionOptions = (item: { id: number | string }) => [
  [
    {
      label: t('customers.copyId'),
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(item.id.toString())
        toast.add({ title: t('global.copied') })
      }
    },
    {
      label: t('customers.viewDetails'),
      icon: 'i-lucide-list'
    },
    {
      label: t('customers.viewPayments'),
      icon: 'i-lucide-wallet'
    },
    {
      label: t('customers.deleteCustomer'),
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect() {
        toast.add({ title: t('customers.customerDeleted'), description: t('customers.customerDeletedDesc') })
      }
    }
  ]
]

function onLoadMore() {
  if (canLoadMore.value && !loading.value) {
    fetchCustomers(false)
  }
}
</script>

<template>
  <BasePage id="customers" :title="$t('customers.title')">
    <template #right>
      <LazyCustomersAddModal />
    </template>

    <template #default>
      <div class="flex flex-col gap-4 h-full">
        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <UInput
            v-model="searchQuery"
            class="max-w-sm"
            icon="i-lucide-search"
            :placeholder="$t('customers.filterEmails')"
          />

          <div class="flex flex-wrap items-center gap-1.5">
            <LazyCustomersDeleteModal :count="selected.length">
              <UButton
                v-if="selected.length"
                :label="t('global.delete')"
                color="error"
                variant="subtle"
                icon="i-lucide-trash"
              >
                <template #trailing>
                  <UKbd>{{ selected.length }}</UKbd>
                </template>
              </UButton>
            </LazyCustomersDeleteModal>

            <USelect
              v-model="filterStatus"
              :items="[
                { label: t('customers.all'), value: 'all' },
                { label: t('customers.subscribed'), value: 'subscribed' },
                { label: t('customers.unsubscribed'), value: 'unsubscribed' },
                { label: t('customers.bounced'), value: 'bounced' }
              ]"
              :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
              :placeholder="t('customers.filterStatus')"
              class="min-w-28"
            />
          </div>
        </div>

        <div class="flex-1 min-h-0 relative">
          <LazyGridList
            v-model:selected="selected"
            :items="customers"
            :columns="columns"
            :loading="loading"
            item-key="id"
            selectable
            :can-load-more="canLoadMore"
            :action-options="getActionOptions"
            @load-more="onLoadMore"
            @refresh="fetchCustomers(true)"
          >
            <template #name="{ item }">
              <div class="flex items-center gap-3">
                <UAvatar :src="item.avatar?.src" size="lg" />
                <div>
                  <p class="font-medium text-highlighted text-sm">
                    {{ item.name }}
                  </p>
                  <p class="text-xs text-muted">
                    @{{ item.name.toLowerCase().replace(/\s+/g, '') }}
                  </p>
                </div>
              </div>
            </template>

            <template #status="{ item }">
              <UBadge class="capitalize" variant="subtle" :color="statusColors[item.status as keyof typeof statusColors]">
                {{ item.status }}
              </UBadge>
            </template>
          </LazyGridList>
        </div>
      </div>
    </template>
  </BasePage>
</template>

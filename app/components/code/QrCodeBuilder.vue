<script setup lang="ts">
export interface QrFieldOption {
  label: string
  value: string
}

interface QrCodeItem {
  id?: string
  _id?: string
  sku?: string
  slug?: string | Record<string, string>
  title?: string | Record<string, string>
  description?: string | Record<string, string>
  price?: number
  salePrice?: number
  basePrice?: number
}

const props = withDefaults(defineProps<{
  item: QrCodeItem
  modelValue?: string
  fields?: QrFieldOption[]
  fieldsDefault?: string[]
}>(), {
  fields: () => [
    { label: 'ID', value: 'id' },
    { label: 'SKU', value: 'sku' },
    { label: 'Title', value: 'title' },
    { label: 'Price', value: 'price' }
  ],
  fieldsDefault: () => ['sku', 'id', 'price']
})

const emit = defineEmits(['update:modelValue', 'close'])
const { t } = useI18n()

const getLocalizedValue = (value?: string | Record<string, string>): string => {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.en || value.vi || Object.values(value)[0] || ''
}

// Default customization state
const mode = ref<'sku' | 'url' | 'json'>('url')
const baseUrl = ref('')
const selectedFields = ref<string[]>([...props.fieldsDefault])

// Initialize
onMounted(() => {
  if (import.meta.client) {
    baseUrl.value = window.location.origin
  }

  // Try to guess mode from existing value
  if (props.modelValue) {
    if (props.modelValue.startsWith('http')) {
      mode.value = 'url'
    } else if (props.modelValue.startsWith('{') && props.modelValue.endsWith('}')) {
      mode.value = 'json'
    } else {
      mode.value = 'sku'
    }
  }
})

// Generated content
const qrContent = computed(() => {
  if (mode.value === 'sku') {
    return props.item.sku || ''
  }

  if (mode.value === 'url') {
    // Fix object object bug by using getLocalizedValue for slug
    const slug = getLocalizedValue(props.item.slug) || props.item._id
    return `${baseUrl.value}/${slug}`
  }

  if (mode.value === 'json') {
    const data: Record<string, string | number | undefined> = {}
    selectedFields.value.forEach((field) => {
      const key = field === 'id' ? '_id' : field
      const val = (props.item as unknown as Record<string, string | number | undefined>)[key]
      if (val !== undefined) {
        data[field] = (field === 'title' || field === 'description') ? getLocalizedValue(val as string | Record<string, string>) : val
      }
    })

    // Fallback for price if not directly in fields
    if (selectedFields.value.includes('price')) {
      data.price = props.item.salePrice || props.item.basePrice
    }

    return JSON.stringify(data)
  }

  return ''
})

const save = () => {
  emit('update:modelValue', qrContent.value)
  emit('close')
}

const copyToClipboard = () => {
  navigator.clipboard.writeText(qrContent.value)
  useToast().add({
    title: t('common.copied'),
    color: 'success',
    icon: 'i-lucide-check'
  })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <!-- Mode Selection -->
      <div
        class="space-y-3 bg-gray-100/50 dark:bg-gray-800/20 p-5 rounded-2xl border border-gray-200 dark:border-gray-800"
      >
        <label class="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <UIcon name="i-lucide-layers" class="w-3 h-3" />
          {{ $t('common.type') }}
        </label>
        <URadioGroup
          v-model="mode"
          :items="[
            { value: 'url', label: 'Website URL', description: 'Directs customers to item page' },
            { value: 'json', label: 'Data Object (JSON)', description: 'For internal inventory scanning' },
            { value: 'sku', label: 'SKU Only', description: 'Classic SKU code' }
          ]"
        />
      </div>

      <!-- <USeparator class="my-2 opacity-80" /> -->

      <!-- Dynamic Settings Based on Mode -->
      <div
        class="bg-gray-100/50 dark:bg-gray-800/20 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 min-h-[160px] mt-2"
      >
        <!-- URL Settings -->
        <div v-if="mode === 'url'" class="space-y-4">
          <UFormField
            label="Base URL"
            name="baseUrl"
            help="The root URL of your website"
            :hint="`${baseUrl?.length || 0}/255`"
            :ui="{ hint: 'text-[9px]' }"
          >
            <UInput
              v-model="baseUrl"
              placeholder="https://yourdomain.com"
              class="w-full"
              size="md"
              :maxlength="255"
            />
          </UFormField>
          <div
            class="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800"
          >
            <UIcon name="i-lucide-link" class="text-primary-500 shrink-0" />
            <p class="text-[11px] font-mono text-gray-500 truncate italic">
              {{ qrContent }}
            </p>
          </div>
        </div>

        <!-- JSON Settings -->
        <div v-if="mode === 'json'" class="space-y-4">
          <UFormField :label="t('common.attributes') || 'Fields'" name="fields">
            <div class="grid grid-cols-2 gap-x-4 gap-y-2">
              <div
                v-for="opt in fields"
                :key="opt.value"
                class="flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-colors"
              >
                <UCheckbox
                  :id="`field-${opt.value}`"
                  :label="opt.label"
                  :model-value="selectedFields.includes(opt.value)"
                  @update:model-value="(checked) => {
                    if (checked) selectedFields.push(opt.value)
                    else selectedFields = selectedFields.filter(f => f !== opt.value)
                  }"
                />
              </div>
            </div>
          </UFormField>
          <div
            class="bg-gray-900 p-3 rounded-lg text-[10px] font-mono text-emerald-400 overflow-hidden border border-gray-800 flex items-start gap-2"
          >
            <UIcon name="i-lucide-code" class="mt-0.5 shrink-0 opacity-50" />
            <div class="truncate italic">
              {{ qrContent }}
            </div>
          </div>
        </div>

        <!-- SKU Settings -->
        <div v-if="mode === 'sku'" class="flex flex-col items-center justify-center py-6 text-center">
          <div class="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-950 flex items-center justify-center mb-3">
            <UIcon name="i-lucide-hash" class="w-6 h-6 text-primary-500" />
          </div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
            {{ t('products.sku') }}:
            <span class="font-mono font-black text-primary-600">
              {{ item.sku || 'N/A' }}
            </span>
          </p>
        </div>
      </div>

      <!-- <USeparator class="my-2 opacity-80" /> -->

      <!-- Preview Section -->
      <div
        class="bg-gray-100/80 dark:bg-gray-800/40 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-center gap-8 mt-2"
      >
        <div class="relative group shrink-0">
          <div
            class="bg-white p-4 rounded-xl shadow-lg border border-gray-100 transform transition-transform group-hover:scale-[1.02]"
          >
            <LazyCodeQrcodeGenerator :value="qrContent" :size="120" :options="{ quietZone: 10 }" />
          </div>
          <div class="absolute -top-2 -right-2">
            <UButton
              icon="i-lucide-copy"
              color="info"
              variant="soft"
              size="xs"
              class="rounded-full"
              @click="copyToClipboard"
            />
          </div>
        </div>

        <div class="flex-1 space-y-3 text-center sm:text-left">
          <p class="text-[11px] text-gray-500 leading-relaxed italic">
            {{ t('common.qr_code_desc', `This code will be generated based on the selected configuration and can be
            scanned by any standard QR reader`) }}
          </p>
        </div>
      </div>
    </div>

    <USeparator class="my-2 opacity-80" />
    <!-- Footer -->
    <div class="flex items-center justify-end gap-3">
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('common.cancel')"
        @click="emit('close')"
      />
      <UButton
        color="primary"
        variant="soft"
        icon="i-lucide-check-circle"
        :label="t('common.update')"
        @click="save"
      />
    </div>
  </div>
</template>

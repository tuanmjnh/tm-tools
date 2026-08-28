<script setup lang="ts">
const props = defineProps<{
  modelValue?: string
  label?: string
  name?: string
  required?: boolean
  disabled?: boolean
  prefix?: string
  suffix?: string
  sourceTitle?: string
  maxlength?: number
  placeholder?: string
  error?: string
}>()

const emit = defineEmits(['update:modelValue'])

const code = useVModel(props, 'modelValue', emit)
const isQrOpen = ref(false)

const actualMaxLength = computed(() => props.maxlength || 50)
const actualLabel = computed(() => props.label || 'Code')
const actualName = computed(() => props.name || 'code')
const actualPlaceholder = computed(() => props.placeholder || '')

const onGenerate = () => {
  const p = props.prefix || ''
  const s = props.suffix || ''
  let baseCode = ''
  if (props.sourceTitle) {
    baseCode = toCode(props.sourceTitle)
  } else {
    baseCode = Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  // Combine and slice to max length just in case
  const generated = `${p}${baseCode}${s}`
  code.value = generated.substring(0, actualMaxLength.value)
}

const openQrModal = () => {
  if (!code.value) return
  isQrOpen.value = true
}
</script>

<template>
  <div>
    <UFormField
      :label="actualLabel"
      :name="actualName"
      :required="required"
      :error="error"
      :hint="`${code?.length || 0}/${actualMaxLength}`"
      :ui="{ hint: 'text-[9px]' }"
    >
      <UInput
        v-model="code"
        v-format-text
        class="w-full font-mono uppercase"
        icon="i-lucide-barcode"
        :ui="{ trailing: 'pe-0' }"
        :disabled="disabled"
        :maxlength="actualMaxLength"
        :placeholder="actualPlaceholder"
      >
        <template #trailing>
          <div class="flex items-center gap-0.5">
            <UTooltip v-if="code" :text="$t('products.sku_qrcode', 'View QR Code')">
              <UButton
                color="neutral"
                variant="link"
                icon="i-lucide-qr-code"
                :padded="false"
                @click="openQrModal"
              />
            </UTooltip>
            <UTooltip :text="$t('common.generate', 'Generate')">
              <UButton
                color="neutral"
                variant="link"
                icon="i-lucide-wand-2"
                :padded="false"
                :disabled="disabled"
                @click="onGenerate"
              />
            </UTooltip>
          </div>
        </template>
      </UInput>
    </UFormField>

    <LazyUModal v-if="isQrOpen" v-model:open="isQrOpen" :title="actualLabel">
      <template #body>
        <div class="flex flex-col items-center justify-center space-y-4">
          <div class="bg-white p-2 rounded-lg border">
            <LazyCodeQrcodeGenerator :value="code || ''" :size="200" :options="{ quietZone: 10 }" />
          </div>
          <p class="font-mono text-xs text-gray-500 max-w-[250px] break-all text-center">
            {{ code }}
          </p>
        </div>
      </template>
      <template #footer>
        <UButton
          block
          color="neutral"
          variant="soft"
          @click="isQrOpen = false"
        >
          {{ $t('common.close', 'Close') }}
        </UButton>
      </template>
    </LazyUModal>
  </div>
</template>

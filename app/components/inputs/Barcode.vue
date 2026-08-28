<script setup lang="ts">
const props = defineProps<{
  modelValue?: string
  label?: string
}>()

const emit = defineEmits(['update:modelValue'])

const barcodeVal = useVModel(props, 'modelValue', emit)
const { t } = useI18n()

const isBarcodeViewOpen = ref(false)
const localError = ref<string | undefined>(undefined)

const validateBarcode = (value: string): string | undefined => {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$/.test(value)) {
    return t('error.invalid_barcode') || 'Barcode must be 8, 12 or 13 digits'
  }
  return undefined
}

const onBlur = () => {
  if (!barcodeVal.value) {
    localError.value = undefined
    return
  }
  localError.value = validateBarcode(barcodeVal.value)
}

const generate = () => {
  barcodeVal.value = generateEan13()
}
</script>

<template>
  <UFormField :label="label || 'Barcode (EAN/UPC)'" name="barcode" :error="localError">
    <UInput
      v-model="barcodeVal"
      placeholder="e.g. 0123456789"
      class="w-full"
      :ui="{ trailing: 'pe-0' }"
      @blur="onBlur"
    >
      <template #trailing>
        <div class="flex gap-1 items-center">
          <UTooltip :text="t('common.generate')">
            <UButton
              color="neutral"
              variant="link"
              icon="i-lucide-wand-2"
              :padded="false"
              @click="generate"
            />
          </UTooltip>
          <UTooltip :text="t('common.view') || 'View Barcode'">
            <UButton
              v-if="barcodeVal"
              color="neutral"
              variant="link"
              icon="i-lucide-barcode"
              :padded="false"
              @click="isBarcodeViewOpen = true"
            />
          </UTooltip>
        </div>
      </template>
    </UInput>
  </UFormField>

  <!-- Barcode View Modal -->
  <LazyUModal v-if="isBarcodeViewOpen" v-model:open="isBarcodeViewOpen" :title="t('products.barcode')">
    <template #content>
      <div class="flex flex-col items-center justify-center space-y-4 p-8">
        <div class="bg-white p-4 rounded-xl border-2 border-gray-100 shadow-sm">
          <LazyCodeBarcodeGenerator :value="barcodeVal || ''" :options="{ width: 2, height: 80, displayValue: true }" />
        </div>
        <div class="flex flex-col items-center gap-1 px-4 text-center">
          <span class="text-[10px] uppercase font-bold text-gray-400 tracking-widest">
            {{ t('products.barcode') }}
          </span>
          <p class="font-mono text-sm font-bold text-gray-700 dark:text-gray-300 break-all">
            {{ barcodeVal }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 p-4 sm:px-6">
        <UButton
          block
          color="neutral"
          variant="soft"
          @click="isBarcodeViewOpen = false"
        >
          {{ t('common.close') }}
        </UButton>
      </div>
    </template>
  </LazyUModal>
</template>

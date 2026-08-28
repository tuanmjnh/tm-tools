<script setup lang="ts">
const props = defineProps<{
  modelValue?: string
  item: {
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
}>()

const emit = defineEmits(['update:modelValue'])

const qrCodeVal = useVModel(props, 'modelValue', emit)

const isQrBuilderOpen = ref(false)
const isQrViewOpen = ref(false)
</script>

<template>
  <div>
    <UFormField label="QR Code" name="qrCode">
      <UInput
        v-model="qrCodeVal"
        :placeholder="$t('products.generated_content')"
        class="w-full"
        :ui="{ trailing: 'pe-0' }"
      >
        <template #trailing>
          <div class="flex gap-1">
            <UTooltip :text="$t('products.customize_content')">
              <UButton
                color="neutral"
                variant="link"
                icon="i-lucide-settings-2"
                :padded="false"
                @click="isQrBuilderOpen = true"
              />
            </UTooltip>
            <UTooltip :text="$t('common.view_qr')">
              <UButton
                color="neutral"
                variant="link"
                icon="i-lucide-qr-code"
                :padded="false"
                @click="isQrViewOpen = true"
              />
            </UTooltip>
          </div>
        </template>
      </UInput>
    </UFormField>

    <!-- QR Code Builder -->
    <LazyBaseResponsiveModal v-if="isQrBuilderOpen" v-model:open="isQrBuilderOpen" :title="$t('common.qr_code_custom')">
      <template #body>
        <LazyCodeQrCodeBuilder v-model="qrCodeVal" :item="item" @close="isQrBuilderOpen = false" />
      </template>
    </LazyBaseResponsiveModal>

    <!-- QR Code View Modal -->
    <LazyUModal
      v-if="isQrViewOpen"
      v-model:open="isQrViewOpen"
      :title="$t('common.qr_code_custom')"
      :close="false"
      :description="$t('common.qr_code_desc')"
    >
      <template #body>
        <div class="flex flex-col items-center justify-center space-y-4">
          <div class="bg-white p-2 rounded-lg border">
            <LazyCodeQrcodeGenerator :value="qrCodeVal || ''" :size="200" :options="{ quietZone: 10 }" />
          </div>
          <p class="font-mono text-xs text-gray-500 max-w-[250px] break-all text-center">
            {{ qrCodeVal }}
          </p>
        </div>
      </template>
      <template #footer>
        <UButton
          block
          color="neutral"
          variant="soft"
          @click="isQrViewOpen = false"
        >
          {{ $t('common.close') }}
        </UButton>
      </template>
    </LazyUModal>
  </div>
</template>

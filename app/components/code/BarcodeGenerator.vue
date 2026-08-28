<script setup lang="ts">
import JsBarcode from 'jsbarcode'

const props = defineProps<{
  value: string
  options?: any
  tag?: 'svg' | 'canvas' | 'img'
}>()

const barcodeRef = ref<HTMLElement | null>(null)

const render = () => {
  if (!barcodeRef.value || !props.value) return

  try {
    JsBarcode(barcodeRef.value, props.value, {
      format: 'CODE128',
      lineColor: '#000000',
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 14,
      textMargin: 0,
      fontOptions: 'bold',
      ...props.options
    })
  } catch (e) {
    console.error('Barcode generation error:', e)
  }
}

onMounted(() => {
  render()
})

watch(() => [props.value, props.options], () => {
  render()
})
</script>

<template>
  <component :is="tag || 'svg'" ref="barcodeRef" class="max-w-full h-auto"></component>
</template>

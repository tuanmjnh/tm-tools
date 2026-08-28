<script setup lang="ts">
import EasyQRCode from 'easyqrcodejs'

const props = defineProps<{
  value: string
  options?: any
  size?: number
}>()

const qrcodeRef = ref<HTMLElement | null>(null)
let qrcode: any = null

const render = () => {
  if (!qrcodeRef.value || !props.value) return

  // Clear existing
  if (qrcode) {
    // EasyQRCode does not have a destroy method that cleans up the DOM completely in all versions,
    // so we manually clear the container content.
    qrcodeRef.value.innerHTML = ''
    qrcode = null
  }

  // Clean content just in case
  qrcodeRef.value.innerHTML = ''

  // Default options
  const config = {
    text: props.value,
    width: props.size || 256,
    height: props.size || 256,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: EasyQRCode.CorrectLevel.H, // High error correction
    logo: props.options?.logo,
    logoWidth: props.options?.logoWidth,
    logoHeight: props.options?.logoHeight,
    logoBackgroundColor: props.options?.logoBackgroundColor,
    logoBackgroundTransparent: props.options?.logoBackgroundTransparent,
    quietZone: props.options?.quietZone ?? 0,
    ...props.options
  }

  try {
    qrcode = new EasyQRCode(qrcodeRef.value, config)
  } catch (e) {
    console.error('QR Code generation error:', e)
  }
}

onMounted(() => {
  render()
})

watch(() => [props.value, props.options, props.size], () => {
  render()
})
</script>

<template>
  <div ref="qrcodeRef" class="inline-block"></div>
</template>

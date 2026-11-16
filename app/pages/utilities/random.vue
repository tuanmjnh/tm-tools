<script setup lang="ts">
import { UtilitiesRandomPanel } from '@tuanmjnh/tm-ui'

const { t } = useI18n()
const toast = useToast()

function onCopied() {
  toast.add({ title: t('utilities.text.copied'), color: 'success', icon: 'i-lucide-check' })
}

function onCopyError() {
  toast.add({ title: 'Copy failed', color: 'error', icon: 'i-lucide-circle-alert' })
}
</script>

<template>
  <UtilitiesRandomPanel :t="t" @copied="onCopied" @copy-error="onCopyError" />
</template>

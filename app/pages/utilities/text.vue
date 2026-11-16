<script setup lang="ts">
import { UtilitiesTextPanel } from '@tuanmjnh/tm-ui'

// The panel is package code, so the wording and the acknowledgement stay here:
// `t` supplies every label and `copied` decides whether the user sees a toast.
const { t } = useI18n()
const toast = useToast()

function onCopied() {
  toast.add({ title: t('utilities.text.copied'), color: 'success', icon: 'i-lucide-check' })
}

function onCopyError() {
  toast.add({ title: t('common.error'), color: 'error', icon: 'i-lucide-circle-alert' })
}
</script>

<template>
  <UtilitiesTextPanel :t="t" @copied="onCopied" @copy-error="onCopyError" />
</template>

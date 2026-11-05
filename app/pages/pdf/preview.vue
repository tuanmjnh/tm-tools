<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { pdfFileUrl, type PdfFileArea } from '~/utils/pdfStudio'

/** Standalone viewer opened by `window.open` — no navigation chrome. */
definePageMeta({ layout: false })

const { t } = useI18n()
const route = useRoute()
const { convertInput } = usePdfStudio()
const { fileItems } = usePdfMenus()

const AREAS: PdfFileArea[] = ['sources', 'inputs', 'word', 'split', 'images', 'merged', 'products', 'office']

const area = computed<PdfFileArea>(() => {
  const value = String(route.query.area ?? '') as PdfFileArea
  return AREAS.includes(value) ? value : 'sources'
})
const name = computed(() => String(route.query.name ?? ''))
const path = computed(() => String(route.query.path ?? '') || undefined)
const label = computed(() => name.value.split('/').pop() || name.value)
const converting = ref(false)

useHead({ title: computed(() => label.value || t('pdf.preview.title')) })

async function convert() {
  converting.value = true
  const created = await convertInput(name.value)
  converting.value = false
  if (created) {
    await navigateTo({ query: { area: 'merged', name: created.name } }, { replace: true })
  }
}

const menu = computed(() => fileItems({
  area: area.value,
  name: name.value,
  path: path.value,
  deletable: false,
  preview: false,
  extra: [
    {
      label: t('pdf.actions.reload'),
      icon: 'i-lucide-rotate-cw',
      onSelect: () => window.location.reload()
    },
    {
      label: t('pdf.actions.copyLink'),
      icon: 'i-lucide-link',
      onSelect: () => {
        void navigator.clipboard.writeText(`${window.location.origin}${pdfFileUrl(area.value, name.value, true)}`)
      }
    }
  ]
}) as DropdownMenuItem[][])
</script>

<template>
  <PdfContextMenu :items="menu" class="flex h-screen w-screen flex-col bg-default overflow-hidden select-text">
    <div v-if="!name" class="flex flex-1 flex-col items-center justify-center gap-2 text-center p-6">
      <UIcon name="i-lucide-file-question" class="size-8 text-dimmed" />
      <p class="text-sm font-medium">
        {{ t('pdf.preview.missingName') }}
      </p>
      <p class="max-w-sm text-xs text-muted">
        {{ t('pdf.preview.missingNameDesc') }}
      </p>
    </div>

    <template v-else>
      <PdfPreviewFile
        :area="area"
        :name="name"
        class="min-h-0 flex-1 w-full"
        @convert="convert"
      />
      <p
        v-if="converting"
        class="flex items-center gap-2 border-t border-default px-3 py-2 text-xs text-muted shrink-0 bg-elevated/80"
      >
        <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin text-primary" />
        {{ t('pdf.preview.converting') }}
      </p>
    </template>
  </PdfContextMenu>
</template>

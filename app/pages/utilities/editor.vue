<script setup lang="ts">
import { useEditorType } from '~/composables/useEditorType'

const { editorType, setEditorType } = useEditorType()
const { t } = useI18n()
const content = ref('')

function copyContent() {
  navigator.clipboard.writeText(content.value)
}

function downloadContent() {
  const blob = new Blob([content.value], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'editor-content-' + new Date().toISOString().split('T')[0] + '.html'
  a.click()
  URL.revokeObjectURL(url)
}

function clearContent() {
  content.value = ''
}

const { currentUtility } = useUtilitiesMeta()
</script>

<template>
  <BasePage id="utilities-editor" :title="currentUtility.title" :description="currentUtility.description">
    <template #right>
      <div class="flex items-center gap-2">
        <UButton
          v-if="editorType === 'tiptap'"
          variant="solid"
          color="primary"
          size="sm"
          @click="setEditorType('tinymce')"
        >
          <UIcon name="i-lucide-square" class="mr-1" /> TinyMCE
        </UButton>
        <UButton
          v-else
          variant="soft"
          color="primary"
          size="sm"
          @click="setEditorType('tiptap')"
        >
          <UIcon name="i-lucide-text" class="mr-1" /> Tiptap
        </UButton>
      </div>
    </template>

    <div class="space-y-4">
      <template v-if="editorType === 'tiptap'">
        <EditorTiptap
          v-model="content"
          :placeholder="t('utilities.editor.placeholder')"
          :is-bubble="false"
        />
      </template>

      <template v-else>
        <EditorTinymce
          v-model="content"
          :placeholder="t('utilities.editor.placeholder')"
        />
      </template>

      <div class="flex gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          :label="t('utilities.editor.copy')"
          @click="copyContent"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          :label="t('utilities.editor.download')"
          @click="downloadContent"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          :label="t('utilities.editor.clear')"
          @click="clearContent"
        />
      </div>
    </div>
  </BasePage>
</template>

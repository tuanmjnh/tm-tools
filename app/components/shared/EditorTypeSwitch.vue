<script setup lang="ts">
import type { EditorType } from '~/composables/useEditorType'

const { editorType, setEditorType } = useEditorType()

const editorTypes: EditorType[] = ['tiptap', 'tinymce']
</script>

<template>
  <div class="inline-flex items-center gap-1.5 p-1 bg-elevated/60 rounded-lg border border-muted">
    <UButton
      v-for="type in editorTypes"
      :key="type"
      size="xs"
      variant="ghost"
      :color="editorType === type ? 'primary' : 'neutral'"
      class="px-2 py-1 rounded-md text-[10px] uppercase font-bold transition-all duration-200"
      :class="[
        editorType === type
          ? 'bg-default shadow-sm'
          : 'text-dimmed hover:text-highlighted'
      ]"
      @click="setEditorType(type)"
    >
      {{ type }}
    </UButton>
  </div>
</template>
